package dev.slimevr.tracking.trackers

import com.jme3.math.FastMath
import dev.slimevr.VRServer
import dev.slimevr.config.ArmsResetModes
import dev.slimevr.config.DriftCompensationConfig
import dev.slimevr.config.ResetsConfig
import dev.slimevr.config.TrackerConfig
import dev.slimevr.config.config
import dev.slimevr.tracking.trackers.udp.TrackerDataType
import io.eiren.util.logging.LogManager
import io.github.axisangles.ktmath.EulerAngles
import io.github.axisangles.ktmath.EulerOrder
import io.github.axisangles.ktmath.Quaternion
import io.github.axisangles.ktmath.Vector3
import kotlin.math.*

/** Class taking care of full reset, yaw reset, mounting reset, and drift compensation logic. */
class TrackerResetsHandler(val tracker: Tracker) {

	private val HalfHorizontal = EulerAngles(
		EulerOrder.YZX,
		0f,
		Math.PI.toFloat(),
		0f,
	).toQuaternion()
	private var driftAmount = 0f

	/** Global reset-based drift model; only touched from the tracking thread. */
	private val driftModel = YawDriftModel(DriftCompensationConfig.DEFAULT_MAX_RESETS)

	/** Monotonic milliseconds for drift timing; replaceable in tests. */
	internal var monotonicMs: () -> Long = { System.nanoTime() / 1_000_000L }

	/** Test seam: forces the drift gate without a running VRServer/HMD. */
	internal var driftGateOverride: Boolean? = null

	/** Persistent (cross-session) learner fed with SENSOR drift (the inverse of the correction). */
	internal var persistentDriftSink: (sensorDriftYawRad: Float, elapsedMs: Long) -> Unit =
		{ yaw, ms -> learnDriftObservation(yaw, ms, 1f) }

	/** Posture of the last reset the drift model trusted; a different posture re-baselines. */
	private var lastTrustedPosture: ResetPosture? = null

	internal val driftObservationCount: Int get() = driftModel.size
	var compensateDrift = false
	private var driftPrediction = false
	private var driftCompensationEnabled = false
	private var adaptiveYawCorrectionRad = 0f
	private var adaptiveYawTargetRad = 0f
	private var adaptiveConfigDirty = false
	private var lastAdaptiveConfigSaveAt = 0L
	private var armsResetMode = ArmsResetModes.BACK
	private var yawResetSmoothTime = 0.0f
	var saveMountingReset = false
	var resetHmdPitch = false
	var allowDriftCompensation = true
		set(value) {
			field = value
			refreshDriftCompensationEnabled()
		}
	var lastResetQuaternion: Quaternion? = null
	var recoveryYawFix = Quaternion.IDENTITY

	val adaptiveYawCorrectionDegrees: Float
		get() = Math.toDegrees(adaptiveYawCorrectionRad.toDouble()).toFloat()
	val adaptiveYawCorrectionRadians: Float
		get() = adaptiveYawCorrectionRad

	// Manual mounting orientation
	var mountingOrientation = HalfHorizontal
		set(value) {
			field = value
			clearRecovery()
			// Clear the mounting reset now that it's been set manually
			clearMounting()
			// A mounting/role change invalidates the runtime correction's reference
			// frame. Keep the learned rate, but re-learn its live offset from the
			// newly mounted pose.
			rebaseAdaptiveCorrectionForReset()
		}

	// Reference adjustment quats

	/**
	 * Gyro fix is set by full reset. This sets the current y rotation to 0, correcting
	 * for initial yaw rotation and the rotation incurred by mounting orientation. This
	 * is a local offset in rotation and does not affect the axes of rotation.
	 *
	 * This rotation is only used to compute [attachmentFix], otherwise [yawFix] would
	 * correct for the same rotation.
	 */
	private var gyroFix = Quaternion.IDENTITY

	/**
	 * Attachment fix is set by full reset. This sets the current x and z rotations to
	 * 0, correcting for initial pitch and roll rotation. This is a global offset in
	 * rotation and affects the axes of rotation.
	 *
	 * This effectively sets the rotation at the moment of a full reset to be
	 * zero-reference in the x and z axes.
	 */
	private var attachmentFix = Quaternion.IDENTITY

	/**
	 * Mounting rotation fix is set by mounting reset. This corrects for the mounting
	 * orientation, then the inverse is used to correct for the rotation incurred. This
	 * value is computed after [yawFix], but takes effect before [yawFix]. This affects
	 * the axes of rotation, but does not incur an offset in rotation.
	 *
	 * This rotation is done in addition to [mountingOrientation] as to not interfere
	 * with the functionality of manual mounting orientation. This effectively sets the
	 * rotation at the moment of a mounting reset to be zero-reference in the y-axis. If
	 * no mounting reset is done, then this rotation will not be used and only
	 * [mountingOrientation] will apply.
	 */
	var mountRotFix = Quaternion.IDENTITY
		private set

	/**
	 * Yaw fix is set by yaw reset. This sets the current y rotation to match the
	 * provided reference, correlating the tracker to the provided frame of reference.
	 * This is a local offset in rotation and does not affect the axes of rotation.
	 *
	 * This effectively aligns the current yaw rotation to the head tracker's yaw
	 * rotation.
	 */
	private var yawFix = Quaternion.IDENTITY

	/**
	 * Constraint fix is set by skeleton constraints. This corrects for any yaw rotation
	 * that violates the skeleton constraints. This is a local offset in rotation and
	 * does not affect the axes of rotation.
	 */
	private var constraintFix = Quaternion.IDENTITY

	// Zero-reference/identity adjustment quats for IMU debugging
	private var gyroFixNoMounting = Quaternion.IDENTITY
	private var attachmentFixNoMounting = Quaternion.IDENTITY
	private var yawFixZeroReference = Quaternion.IDENTITY

	/**
	 * T-Pose down fix is set by full reset. This corrects for the pitch of the rotation
	 * assuming a t-pose reference, adjusting to match our expected i-pose reference.
	 * This is a global offset in rotation and affects the axes of rotation.
	 */
	private var tposeDownFix = Quaternion.IDENTITY

	/**
	 * Reads/loads drift compensation settings from given config
	 */
	fun readDriftCompensationConfig(config: DriftCompensationConfig) {
		driftPrediction = config.prediction
		driftAmount = if (config.amount.isFinite()) {
			config.amount.coerceIn(DriftCompensationConfig.MIN_AMOUNT, DriftCompensationConfig.MAX_AMOUNT)
		} else {
			0f
		}
		val maxResets = config.maxResets.coerceIn(DriftCompensationConfig.MIN_MAX_RESETS, DriftCompensationConfig.MAX_MAX_RESETS)
		if (maxResets != driftModel.capacity) driftModel.resize(maxResets)

		seedLearnedDriftIfEmpty()
		val isBno = tracker.config.imuProfileOverride?.equals("bno085", ignoreCase = true) == true ||
			(tracker.imuType?.name?.contains("BNO") == true && (tracker.config.imuProfileOverride.isNullOrEmpty() || tracker.config.imuProfileOverride.equals("auto", ignoreCase = true)))
		compensateDrift = !isBno && (config.enabled || (tracker.config.autoLearnDrift && tracker.config.learnedDriftRateDegPerMin != 0.0f))
		refreshDriftCompensationEnabled()
	}

	fun seedLearnedDriftIfEmpty() {
		// Seeding belongs to adaptive learning; never revive stored memory while it is off.
		if (!tracker.config.autoLearnDrift) return
		if (driftModel.size == 0 && tracker.isImu()) {
			var effectiveRate = tracker.config.learnedDriftRateDegPerMin
			val override = tracker.config.imuProfileOverride ?: "auto"
			if (override.equals("bno085", ignoreCase = true)) {
				effectiveRate = 0.0f
				compensateDrift = false
			} else if (effectiveRate == 0.0f) {
				// Seed baseline if a known profile preset or IMU is active
				effectiveRate = when (override.lowercase()) {
					"mpu6050" -> 4.5f

					"bmi160" -> 3.15f

					"lsm6_icm" -> 0.85f

					else -> {
						val imuName = tracker.imuType?.name ?: ""
						when {
							imuName.contains("6050") || imuName.contains("6500") -> 4.5f
							imuName.contains("160") -> 3.15f
							imuName.contains("270") || imuName.contains("LSM") || imuName.contains("42688") -> 0.85f
							imuName.contains("BNO") -> 0.0f
							else -> 0.0f
						}
					}
				}
				if (effectiveRate != 0.0f) {
					tracker.config.learnedDriftRateDegPerMin = effectiveRate
				}
			}

			// A profile seed is only a migration prior. It is not applied as active
			// compensation until measured observations have earned confidence.
			if (effectiveRate != 0.0f &&
				effectiveRate.isFinite() &&
				tracker.config.totalDriftObservations > 0 &&
				tracker.config.adaptiveDriftLastAcceptedAt <= 0L
			) {
				val baselineMinutes = 5.0f
				val seedAngleRad = Math.toRadians((effectiveRate * baselineMinutes).toDouble()).toFloat()
				// seed() drops non-finite or implausible values.
				driftModel.seed(seedAngleRad, (baselineMinutes * 60000L).toLong(), monotonicMs())
			}
		}
	}

	fun readAdaptiveProfile(config: TrackerConfig) {
		seedLearnedDriftIfEmpty()
		val isBno = tracker.config.imuProfileOverride?.equals("bno085", ignoreCase = true) == true ||
			(tracker.imuType?.name?.contains("BNO") == true && (tracker.config.imuProfileOverride.isNullOrEmpty() || tracker.config.imuProfileOverride.equals("auto", ignoreCase = true)))
		if (isBno) {
			compensateDrift = false
		} else if (tracker.config.autoLearnDrift && tracker.config.learnedDriftRateDegPerMin != 0.0f) {
			compensateDrift = true
		}
		if (!isBno && allowDriftCompensation) restoreAdaptiveDriftModel()
		refreshDriftCompensationEnabled()
	}

	/** Restores only measured model state; profile defaults remain a weak prior. */
	private fun restoreAdaptiveDriftModel() {
		adaptiveYawCorrectionRad = 0f
		adaptiveYawTargetRad = 0f
		val acceptedAt = tracker.config.adaptiveDriftLastAcceptedAt
		if (!tracker.config.autoLearnDrift || tracker.config.totalDriftObservations <= 0 || acceptedAt <= 0L) return

		val elapsedMs = (System.currentTimeMillis() - acceptedAt).coerceAtLeast(0L)
		// learnedDriftRate is the measured sensor drift direction; runtime
		// compensation applies its inverse.
		val predictedDegrees = (-tracker.config.learnedDriftRateDegPerMin * elapsedMs / 60000.0f)
			.coerceIn(-45.0f, 45.0f)
		adaptiveYawCorrectionRad = Math.toRadians(predictedDegrees.toDouble()).toFloat()
		adaptiveYawTargetRad = adaptiveYawCorrectionRad
	}

	/**
	 * Slews the persistent correction toward a stable-pose estimate. The rate
	 * limit prevents a bad single frame from snapping the torso.
	 */
	fun setAdaptiveYawCorrectionTarget(targetRadians: Float, deltaTimeSeconds: Float) {
		if (!targetRadians.isFinite() || !deltaTimeSeconds.isFinite()) return
		adaptiveYawTargetRad = wrapRadians(targetRadians)
		val error = wrapRadians(adaptiveYawTargetRad - adaptiveYawCorrectionRad)
		val maxStep = Math.toRadians((3.0f * deltaTimeSeconds.coerceIn(0f, 0.1f)).toDouble()).toFloat()
		adaptiveYawCorrectionRad = wrapRadians(
			adaptiveYawCorrectionRad + error.coerceIn(-maxStep, maxStep),
		)
	}

	fun clearAdaptiveYawCorrection() {
		adaptiveYawCorrectionRad = 0f
		adaptiveYawTargetRad = 0f
	}

	/**
	 * Re-anchors live adaptive state after a user calibration without deleting
	 * the persistent learned rate. The next stable-pose window must start from
	 * the new reset reference instead of applying the old pose's correction.
	 */
	private fun rebaseAdaptiveCorrectionForReset() {
		clearAdaptiveYawCorrection()
		AdaptiveDriftCompensation.clear(tracker)
	}

	fun setAdaptiveDriftLearningPaused(paused: Boolean) {
		if (!tracker.isImu()) return
		tracker.config.adaptiveDriftLearningPaused = paused
		if (paused) AdaptiveDriftCompensation.clear(tracker)
		if (VRServer.instanceInitialized) VRServer.instance.configManager.saveConfig()
	}

	fun setAdaptiveDriftEnabled(enabled: Boolean) {
		if (!tracker.isImu()) return
		allowDriftCompensation = enabled
		tracker.config.allowDriftCompensation = enabled
		if (!enabled) {
			clearAdaptiveYawCorrection()
			AdaptiveDriftCompensation.clear(tracker)
		}
		if (VRServer.instanceInitialized) VRServer.instance.configManager.saveConfig()
	}

	/** Restores the model that was accepted immediately before the current one. */
	fun restorePreviousAdaptiveDriftModel(): Boolean {
		val config = tracker.config
		if (!config.hasPreviousAdaptiveDriftModel) return false
		config.learnedDriftRateDegPerMin = config.previousLearnedDriftRateDegPerMin
		config.totalDriftObservations = config.previousTotalDriftObservations
		config.adaptiveDriftConfidence = config.previousAdaptiveDriftConfidence
		config.adaptiveDriftLastAcceptedAt = config.previousAdaptiveDriftLastAcceptedAt
		clearAdaptiveYawCorrection()
		restoreAdaptiveDriftModel()
		AdaptiveDriftCompensation.clear(tracker)
		if (VRServer.instanceInitialized) VRServer.instance.configManager.saveConfig()
		return true
	}

	/** Debounced config persistence for learned observations. */
	fun flushAdaptiveConfigPersistence(nowMs: Long = System.currentTimeMillis()) {
		if (!adaptiveConfigDirty || !VRServer.instanceInitialized) return
		if (lastAdaptiveConfigSaveAt != 0L && nowMs - lastAdaptiveConfigSaveAt < 5_000L) return
		VRServer.instance.configManager.saveConfig()
		lastAdaptiveConfigSaveAt = nowMs
		adaptiveConfigDirty = false
	}

	private fun markAdaptiveConfigDirty() {
		adaptiveConfigDirty = true
		flushAdaptiveConfigPersistence()
	}

	private fun wrapRadians(value: Float): Float {
		var wrapped = value
		while (wrapped > Math.PI.toFloat()) wrapped -= (Math.PI * 2.0).toFloat()
		while (wrapped < -Math.PI.toFloat()) wrapped += (Math.PI * 2.0).toFloat()
		return wrapped
	}

	fun setAdaptiveProfileOverride(profile: String) {
		val normalized = profile.trim().lowercase().takeIf { it in setOf("auto", "mpu6050", "bmi160", "lsm6_icm", "bno085") }
			?: return
		val current = tracker.config.imuProfileOverride ?: "auto"
		if (current == normalized) return

		tracker.config.imuProfileOverride = normalized
		tracker.config.learnedDriftRateDegPerMin = 0.0f
		tracker.config.totalDriftObservations = 0
		tracker.config.adaptiveDriftConfidence = 0.0f
		tracker.config.adaptiveDriftLastAcceptedAt = 0L
		tracker.config.adaptiveDriftModelVersion = 1
		tracker.config.hasPreviousAdaptiveDriftModel = false
		clearAdaptiveYawCorrection()
		clearDriftCompensation()
		AdaptiveDriftCompensation.clear(tracker)
		readAdaptiveProfile(tracker.config)
		if (VRServer.instanceInitialized) {
			readDriftCompensationConfig(VRServer.instance.configManager.vrConfig.driftCompensation)
		}
	}

	fun writeAdaptiveProfile(config: TrackerConfig) {
		// Preserved via tracker.config mutations directly
	}

	fun getDriftSinceDurationSeconds(): Float = driftModel.intervalStart?.let { (monotonicMs() - it) / 1000.0f } ?: 0.0f

	/** Yaw correction the global drift compensation applies right now, in degrees. */
	val globalDriftCorrectionDegrees: Float
		get() = if (driftCompensationEnabled) {
			Math.toDegrees(driftModel.correction(monotonicMs(), driftAmount, driftPrediction).toDouble()).toFloat()
		} else {
			0f
		}

	/**
	 * The current drift interval crossed a yaw discontinuity (recovery
	 * realignment, reboot, mounting change). The next reset only re-baselines.
	 */
	fun invalidateDriftInterval() {
		driftModel.invalidateInterval()
	}

	/**
	 * Clears drift compensation data
	 */
	fun clearDriftCompensation() {
		driftModel.clear()
		adaptiveYawCorrectionRad = 0f
		adaptiveYawTargetRad = 0f
	}

	/**
	 * Resets persistent learned drift and clears active drift compensation buffers.
	 */
	fun resetLearnedDrift() {
		tracker.config.learnedDriftRateDegPerMin = 0.0f
		tracker.config.totalDriftObservations = 0
		tracker.config.adaptiveDriftConfidence = 0.0f
		tracker.config.adaptiveDriftLastAcceptedAt = 0L
		tracker.config.adaptiveDriftModelVersion = 1
		clearDriftCompensation()
		AdaptiveDriftCompensation.clear(tracker)
		if (VRServer.instanceInitialized) {
			VRServer.instance.configManager.saveConfig()
		}
	}

	/**
	 * Records a drift observation obtained from an independent tracker reference.
	 *
	 * Reconnect recovery is deliberately the only automatic reference source here:
	 * the correction is measured after a real outage and validated against multiple
	 * trackers, so normal body motion and Stay Aligned's own correction are not
	 * mistaken for sensor drift.
	 */
	fun learnDriftObservation(observedYaw: Float, elapsedMs: Long, confidence: Float) {
		if (!tracker.isImu() || !tracker.config.autoLearnDrift || elapsedMs < 30_000L || confidence < 0.75f) return
		if (!observedYaw.isFinite() || !confidence.isFinite()) return

		val elapsedMinutes = elapsedMs / 60000.0f
		if (elapsedMinutes <= 0.0f) return

		var observedRate = Math.toDegrees(observedYaw.toDouble()).toFloat() / elapsedMinutes
		while (observedRate > 180.0f) observedRate -= 360.0f
		while (observedRate < -180.0f) observedRate += 360.0f
		// A larger value is more likely to be a mounting change than gyro drift.
		if (abs(observedRate) > 20.0f) return

		val observationCount = tracker.config.totalDriftObservations
		val alpha = if (observationCount < 3) 0.35f else 0.15f
		val currentRate = tracker.config.learnedDriftRateDegPerMin
		tracker.config.previousLearnedDriftRateDegPerMin = currentRate
		tracker.config.previousTotalDriftObservations = observationCount
		tracker.config.previousAdaptiveDriftConfidence = tracker.config.adaptiveDriftConfidence
		tracker.config.previousAdaptiveDriftLastAcceptedAt = tracker.config.adaptiveDriftLastAcceptedAt
		tracker.config.hasPreviousAdaptiveDriftModel = true
		tracker.config.learnedDriftRateDegPerMin =
			((1.0f - alpha) * currentRate + alpha * observedRate).coerceIn(-20.0f, 20.0f)
		tracker.config.totalDriftObservations = observationCount + 1
		tracker.config.adaptiveDriftModelVersion = 1
		tracker.config.adaptiveDriftConfidence = confidence.coerceIn(0f, 1f)
		tracker.config.adaptiveDriftLastAcceptedAt = System.currentTimeMillis()
		markAdaptiveConfigDirty()
	}

	/** Stable-pose observations share the same safety and persistence gate. */
	fun learnStablePoseObservation(observedYaw: Float, elapsedMs: Long, confidence: Float) = learnDriftObservation(observedYaw, elapsedMs, confidence)

	/**
	 * Checks for compensateDrift, allowDriftCompensation, and if
	 * a computed head tracker exists.
	 */
	fun refreshDriftCompensationEnabled() {
		val wasEnabled = driftCompensationEnabled
		driftCompensationEnabled = driftGateOverride ?: (
			compensateDrift &&
				allowDriftCompensation &&
				VRServer.instanceInitialized &&
				TrackerUtils.getNonInternalNonImuTrackerForBodyPosition(
					VRServer.instance.allTrackers,
					TrackerPosition.HEAD,
				) != null
			)
		// Coming back (HMD reconnect, setting toggled) must not apply the time
		// spent disabled at once, nor record that interval as drift.
		if (driftCompensationEnabled && !wasEnabled) driftModel.rebase(monotonicMs())
	}

	/**
	 * Reads/loads reset settings from the given config
	 */
	fun readResetConfig(config: ResetsConfig) {
		armsResetMode = config.mode
		yawResetSmoothTime = config.yawResetSmoothTime
		saveMountingReset = config.saveMountingReset
		resetHmdPitch = config.resetHmdPitch
	}

	fun clearRecovery(fullReset: Boolean = false) {
		if (tracker.recovery.state == TrackerRecoveryState.NEEDS_RESET && !fullReset) return
		recoveryYawFix = Quaternion.IDENTITY
		tracker.recovery.cancel(force = fullReset)
	}

	fun trySetMountingReset(quat: Quaternion) {
		if (saveMountingReset) {
			mountRotFix = quat
		}
	}

	/**
	 * Takes a rotation and adjusts it to resets, mounting,
	 * and drift compensation, with the HMD as the reference.
	 */
	fun getReferenceAdjustedDriftRotationFrom(rotation: Quaternion): Quaternion = adjustToDrift(adjustToReference(rotation))

	/**
	 * Returns the mounting/reset-adjusted sample before adaptive drift. The
	 * stable-pose learner must observe this stage so it cannot learn its own fix.
	 */
	fun getReferenceAdjustedRotationBeforeDrift(rotation: Quaternion): Quaternion = adjustToReference(rotation)

	/**
	 * Takes a rotation and adjusts it to resets and mounting,
	 * with the identity Quaternion as the reference.
	 */
	fun getIdentityAdjustedDriftRotationFrom(rotation: Quaternion): Quaternion = adjustToDrift(adjustToIdentity(rotation))

	/**
	 * Get the reference adjusted accel.
	 */
	// TODO: Make this actually adjusted to the corrected IMU heading. The current
	//  implementation for heading correction doesn't appear to be correct and may simply
	//  make acceleration worse, so I'm just leaving this until we work that out. The
	//  output of this will be world space, but with an unknown offset to heading (yaw).
	//  - Butterscotch
	fun getReferenceAdjustedAccel(rawRot: Quaternion, accel: Vector3): Vector3 = rawRot.sandwich(accel)

	/**
	 * Converts raw or filtered rotation into reference- and
	 * mounting-reset-adjusted by applying quaternions produced after
	 * full reset, yaw rest and mounting reset
	 */
	private fun adjustToReference(rotation: Quaternion): Quaternion {
		var rot = rotation
		// Align heading axis with bone space
		if (!tracker.isHmd || tracker.trackerPosition != TrackerPosition.HEAD) {
			rot *= mountingOrientation
		}
		// Heading correction assuming manual orientation is correct
		rot = gyroFix * rot
		// Align attitude axes with bone space
		rot *= attachmentFix
		// Secondary heading axis alignment with bone space for automatic mounting
		// Note: Applying an inverse amount of heading correction corresponding to the
		//  axis alignment quaternion will leave the correction to another variable
		rot = mountRotFix.inv() * (rot * mountRotFix)
		// More attitude axes alignment specifically for the t-pose configuration, this
		//  probably shouldn't be a separate variable from attachmentFix?
		rot *= tposeDownFix
		// More heading correction
		rot = yawFix * rot
		rot = recoveryYawFix * rot
		rot = constraintFix * rot
		return rot
	}

	/**
	 * Converts raw or filtered rotation into zero-reference-adjusted by
	 * applying quaternions produced after full reset and yaw reset only
	 */
	// This is essentially just adjustToReference but aligning to quaternion identity
	//  rather than to the bone.
	private fun adjustToIdentity(rotation: Quaternion): Quaternion {
		var rot = rotation
		rot = gyroFixNoMounting * rot
		rot *= attachmentFixNoMounting
		rot = yawFixZeroReference * rot
		rot = recoveryYawFix * rot
		rot = constraintFix * rot
		return rot
	}

	/**
	 * Adjust the given rotation for drift compensation if enabled,
	 * and returns it
	 */
	private fun adjustToDrift(rotation: Quaternion, includeAdaptiveYaw: Boolean = true): Quaternion {
		var adjusted = rotation
		if (driftCompensationEnabled) {
			val driftYaw = driftModel.correction(monotonicMs(), driftAmount, driftPrediction)
			if (driftYaw != 0f) adjusted = Quaternion.rotationAroundYAxis(driftYaw) * adjusted
		}
		if (includeAdaptiveYaw && allowDriftCompensation && adaptiveYawCorrectionRad != 0f) {
			adjusted = Quaternion.rotationAroundYAxis(adaptiveYawCorrectionRad) * adjusted
		}
		return adjusted
	}

	/**
	 * Reset the tracker so that its current rotation is counted as (0, HMD Yaw,
	 * 0). This allows the tracker to be strapped to body at any pitch and roll.
	 */
	fun resetFull(reference: Quaternion) {
		clearRecovery(fullReset = true)
		rebaseAdaptiveCorrectionForReset()
		constraintFix = Quaternion.IDENTITY

		if (tracker.trackerDataType == TrackerDataType.FLEX_RESISTANCE) {
			tracker.trackerFlexHandler.resetMin()
			postProcessResetFull(reference)
			return
		} else if (tracker.trackerDataType == TrackerDataType.FLEX_ANGLE) {
			postProcessResetFull(reference)
			return
		}

		// Adjust for T-Pose (down)
		tposeDownFix = if (((tracker.trackerPosition.isLeftArm() || tracker.trackerPosition.isLeftFinger()) && armsResetMode == ArmsResetModes.TPOSE_DOWN)) {
			EulerAngles(EulerOrder.YZX, 0f, 0f, -FastMath.HALF_PI).toQuaternion()
		} else if (((tracker.trackerPosition.isRightArm() || tracker.trackerPosition.isRightFinger()) && armsResetMode == ArmsResetModes.TPOSE_DOWN)) {
			EulerAngles(EulerOrder.YZX, 0f, 0f, FastMath.HALF_PI).toQuaternion()
		} else {
			Quaternion.IDENTITY
		}

		// Old rot for drift compensation
		val oldRot = adjustToReference(tracker.getRawRotation())
		lastResetQuaternion = oldRot

		// Adjust raw rotation to mountingOrientation
		val mountingAdjustedRotation = tracker.getRawRotation() * mountingOrientation

		// Gyrofix
		if (tracker.allowMounting || (tracker.trackerPosition == TrackerPosition.HEAD && !tracker.isHmd)) {
			gyroFix = if (tracker.isComputed) {
				fixGyroscope(tracker.getRawRotation())
			} else {
				fixGyroscope(mountingAdjustedRotation * tposeDownFix)
			}
		}

		// Mounting for computed trackers
		if (tracker.isComputed && tracker.trackerPosition != TrackerPosition.HEAD) {
			// Set mounting to the reference's yaw so that a computed
			// tracker goes forward according to the head tracker.
			mountRotFix = getYawQuaternion(reference)
		}

		// Attachment fix
		attachmentFix = if (tracker.trackerPosition == TrackerPosition.HEAD && tracker.isHmd) {
			if (resetHmdPitch) {
				// Reset the HMD's pitch if it's assigned to head and resetHmdPitch is true
				// Get rotation without yaw (make sure to use the raw rotation directly!)
				val rotBuf = getYawQuaternion(tracker.getRawRotation()).inv() * tracker.getRawRotation()
				// Isolate pitch
				Quaternion(rotBuf.w, -rotBuf.x, 0f, 0f).unit()
			} else {
				// Don't reset the HMD at all
				Quaternion.IDENTITY
			}
		} else {
			fixAttachment(mountingAdjustedRotation)
		}

		// Rotate attachmentFix by 180 degrees as a workaround for t-pose (down)
		if (tposeDownFix != Quaternion.IDENTITY && tracker.allowMounting) {
			attachmentFix *= HalfHorizontal
		}

		makeIdentityAdjustmentQuatsFull()

		// Don't adjust yaw if head and computed
		if (tracker.trackerPosition != TrackerPosition.HEAD || !tracker.isComputed) {
			yawFix = fixYaw(mountingAdjustedRotation, reference)
			tracker.yawResetSmoothing.reset()
		}

		calculateDrift(oldRot, ResetPostureSnapshot.UPRIGHT)

		// Reset Stay Aligned (before resetting filtering, which depends on the
		// tracker's rotation)
		tracker.stayAligned.reset()

		postProcessResetFull(reference)
	}

	private fun postProcessResetFull(reference: Quaternion) {
		if (this.tracker.needReset) {
			this.tracker.needReset = false
		}

		tracker.resetFilteringQuats(reference)
	}

	/**
	 * Reset the tracker so that its current yaw rotation is aligned with the HMD's
	 * Yaw. This allows the tracker to have yaw independent of the HMD. Tracker
	 * should still report yaw as if it was mounted facing HMD, mounting
	 * position should be corrected in the source.
	 *
	 * Lying ([ResetPosture.isLying]): instead of the HMD yaw, the tracker's headward
	 * axis is turned onto [ResetPostureSnapshot.heading] (the HMD crown on the floor),
	 * composed into the existing yaw fix so mounting and attachment stay intact.
	 */
	fun resetYaw(reference: Quaternion, posture: ResetPostureSnapshot = ResetPostureSnapshot.UPRIGHT) {
		if (tracker.recovery.state == TrackerRecoveryState.NEEDS_RESET) return
		clearRecovery()
		rebaseAdaptiveCorrectionForReset()
		// TODO HMD doesn't get yaw reset, which makes it so tracker.resetFilteringQuats() doesn't get called

		constraintFix = Quaternion.IDENTITY

		if (tracker.trackerDataType == TrackerDataType.FLEX_RESISTANCE ||
			tracker.trackerDataType == TrackerDataType.FLEX_ANGLE
		) {
			// Don't do anything as these don't have yaw anyways
			return
		}

		// Old rot for drift compensation
		val oldRot = adjustToReference(tracker.getRawRotation())
		lastResetQuaternion = oldRot

		val yawFixOld = yawFix
		yawFix = if (posture.posture.isLying) {
			lyingYawFix(oldRot, posture.heading)
		} else {
			fixYaw(tracker.getRawRotation() * mountingOrientation, reference)
		}
		tracker.yawResetSmoothing.reset()

		makeIdentityAdjustmentQuatsYaw()

		calculateDrift(oldRot, posture)

		// Start at yaw before reset if smoothing enabled
		if (yawResetSmoothTime > 0.0f) {
			tracker.yawResetSmoothing.interpolate(
				yawFixOld / yawFix,
				Quaternion.IDENTITY,
				yawResetSmoothTime,
			)
		}

		// Reset Stay Aligned (before resetting filtering, which depends on the
		// tracker's rotation)
		tracker.stayAligned.reset()

		tracker.resetFilteringQuats(reference)
	}

	/**
	 * Perform the math to align the tracker to go forward
	 * and stores it in mountRotFix, and adjusts yawFix
	 */
	fun resetMounting(reference: Quaternion) {
		if (tracker.recovery.state == TrackerRecoveryState.NEEDS_RESET) return
		clearRecovery()
		rebaseAdaptiveCorrectionForReset()
		// Mounting calibration must capture the physical pose, not a transient
		// Stay Aligned correction that was calculated from the previous pose.
		tracker.stayAligned.reset()
		if (tracker.trackerDataType == TrackerDataType.FLEX_RESISTANCE) {
			tracker.trackerFlexHandler.resetMax()
			tracker.resetFilteringQuats(reference)
			return
		} else if (tracker.trackerDataType == TrackerDataType.FLEX_ANGLE) {
			return
		}

		constraintFix = Quaternion.IDENTITY

		// Get the current calibrated rotation
		// Do not bake the persistent adaptive yaw correction into mountRotFix.
		// It is cleared above and will be learned again against this new frame.
		var rotBuf = adjustToDrift(
			tracker.getRawRotation() * mountingOrientation,
			includeAdaptiveYaw = false,
		)
		rotBuf = gyroFix * rotBuf
		rotBuf *= attachmentFix
		rotBuf = yawFix * rotBuf

		// Adjust buffer to reference
		rotBuf = reference.project(Vector3.POS_Y).inv().unit() * rotBuf

		// Rotate a vector pointing up by the quat
		val rotVector = rotBuf.sandwich(Vector3.POS_Y)

		// Calculate the yaw angle using tan
		var yawAngle = atan2(rotVector.x, rotVector.z)

		// Adjust for T-Pose and fingers
		if ((tracker.trackerPosition.isLeftArm() && armsResetMode == ArmsResetModes.TPOSE_DOWN) ||
			(tracker.trackerPosition.isRightArm() && armsResetMode == ArmsResetModes.TPOSE_UP) ||
			tracker.trackerPosition.isLeftFinger()
		) {
			// Tracker goes right
			yawAngle -= FastMath.HALF_PI
		}
		if ((tracker.trackerPosition.isLeftArm() && armsResetMode == ArmsResetModes.TPOSE_UP) ||
			(tracker.trackerPosition.isRightArm() && armsResetMode == ArmsResetModes.TPOSE_DOWN) ||
			tracker.trackerPosition.isRightFinger()
		) {
			// Tracker goes left
			yawAngle += FastMath.HALF_PI
		}

		// Adjust for forward/back arms and thighs
		val isLowerArmBack = armsResetMode == ArmsResetModes.BACK && (tracker.trackerPosition.isLeftLowerArm() || tracker.trackerPosition.isRightLowerArm())
		val isArmForward = armsResetMode == ArmsResetModes.FORWARD && (tracker.trackerPosition.isLeftArm() || tracker.trackerPosition.isRightArm())
		if (!tracker.trackerPosition.isThigh() && !isArmForward && !isLowerArmBack) {
			// Tracker goes back
			yawAngle -= FastMath.PI
		}

		// Make an adjustment quaternion from the angle
		mountRotFix = EulerAngles(EulerOrder.YZX, 0f, yawAngle, 0f).toQuaternion()
		invalidateDriftInterval()

		// save mounting reset
		if (saveMountingReset) tracker.saveMountingResetOrientation(mountRotFix)

		tracker.resetFilteringQuats(reference)
	}

	/**
	 * Apply a corrective rotation to the gyroFix
	 */
	fun updateConstraintFix(correctedRotation: Quaternion) {
		constraintFix *= correctedRotation
	}

	fun clearMounting() {
		mountRotFix = Quaternion.IDENTITY
		// Changes the reference frame; also covers manual mounting changes.
		invalidateDriftInterval()
	}

	/**
	 * Turns [adjusted]'s headward axis onto [heading] about world Y. [adjusted] is
	 * `yawFix * inner` here (recovery and constraint fixes were just cleared), so a
	 * world yaw on the left of [yawFix] moves exactly that axis.
	 */
	private fun lyingYawFix(adjusted: Quaternion, heading: Float): Quaternion {
		val current = ResetPostureClassifier.heading(adjusted.sandwichUnitY()) ?: return yawFix
		val delta = ResetPostureClassifier.wrap(heading - current)
		return (Quaternion.rotationAroundYAxis(delta) * yawFix).unit()
	}

	private fun fixGyroscope(sensorRotation: Quaternion): Quaternion = getYawQuaternion(sensorRotation).inv()

	private fun fixAttachment(sensorRotation: Quaternion): Quaternion = (gyroFix * sensorRotation).inv()

	private fun fixYaw(sensorRotation: Quaternion, reference: Quaternion): Quaternion {
		var rot = gyroFix * sensorRotation
		rot *= attachmentFix
		rot = mountRotFix.inv() * (rot * mountRotFix)
		rot = getYawQuaternion(rot, useHorizontalFootHeading = tracker.trackerPosition.isFoot())
		return rot.inv() * reference.project(Vector3.POS_Y).unit()
	}

	/**
	 * Extract a foot heading from the most horizontal tracker axis.
	 *
	 * Euler yaw is not invariant to the order in which a foot tracker is tilted
	 * and rolled. That made a yaw reset assign a different sideways correction to
	 * each foot, which could visibly shift the feet and open the stance. Prefer
	 * the axis with the strongest horizontal component so this remains defined
	 * when a foot is mounted nearly on its side. Other tracker roles retain the
	 * established YZX convention because their reset semantics depend on it.
	 */
	private fun getYawQuaternion(rot: Quaternion, useHorizontalFootHeading: Boolean = false): Quaternion {
		if (!useHorizontalFootHeading) {
			return EulerAngles(EulerOrder.YZX, 0f, rot.toEulerAngles(EulerOrder.YZX).y, 0f).toQuaternion().twinNearest(rot)
		}

		val normalized = rot.unit()
		val localX = normalized.sandwichUnitX()
		val localZ = normalized.sandwichUnitZ()
		val xHorizontalSq = localX.x * localX.x + localX.z * localX.z
		val zHorizontalSq = localZ.x * localZ.x + localZ.z * localZ.z
		val yaw = when {
			xHorizontalSq >= zHorizontalSq && xHorizontalSq > 1e-6f -> atan2(-localX.z, localX.x)
			zHorizontalSq > 1e-6f -> atan2(localZ.x, localZ.z)
			else -> 0f
		}

		return Quaternion.rotationAroundYAxis(yaw).twinNearest(rot)
	}

	private fun makeIdentityAdjustmentQuatsFull() {
		val sensorRotation = tracker.getRawRotation()
		gyroFixNoMounting = fixGyroscope(sensorRotation)
		attachmentFixNoMounting = (gyroFixNoMounting * sensorRotation).inv()
		yawFixZeroReference = Quaternion.IDENTITY
	}

	private fun makeIdentityAdjustmentQuatsYaw() {
		var sensorRotation = tracker.getRawRotation()
		sensorRotation = gyroFixNoMounting * sensorRotation
		sensorRotation *= attachmentFixNoMounting
		yawFixZeroReference = fixGyroscope(sensorRotation)
	}

	/**
	 * Records the yaw correction this reset applied since the previous one as a
	 * drift observation, and starts the next interval.
	 *
	 * One gate feeds both learners: the posture must be trusted ([posture] confident,
	 * not UNSAFE), the delta a pure yaw, the interval valid, and the posture the same
	 * as the previous trusted reset (upright, supine and prone don't share a
	 * baseline). Anything else only re-baselines. The persistent learner gets only
	 * new model observations (never cooldown merges) and stores sensor drift, the
	 * inverse of the correction.
	 */
	private fun calculateDrift(beforeQuat: Quaternion, posture: ResetPostureSnapshot) {
		val now = monotonicMs()
		val deltaYaw = pureYawDelta(adjustToReference(tracker.getRawRotation()), beforeQuat)
		val trusted = posture.confident && posture.posture != ResetPosture.UNSAFE && deltaYaw != null
		if (!driftCompensationEnabled || !trusted) {
			driftModel.rebase(now)
			if (driftCompensationEnabled) LogManager.info("[TrackerResetsHandler] ${tracker.name}: reset not learnable (${posture.posture}), drift re-baselined")
			return
		}
		if (lastTrustedPosture != null && lastTrustedPosture != posture.posture) driftModel.invalidateInterval()
		lastTrustedPosture = posture.posture
		val start = driftModel.intervalStart
		val outcome = driftModel.onReset(deltaYaw, now)
		if (outcome == YawDriftModel.Outcome.ADDED && start != null) {
			persistentDriftSink(-deltaYaw, now - start)
		}
	}

	/** Signed shortest yaw of `after / before`, or null when the change is not (close to) a pure world yaw. */
	private fun pureYawDelta(after: Quaternion, before: Quaternion): Float? {
		val d = (after / before).unit().twinNearest(Quaternion.IDENTITY)
		if (!d.w.isFinite() || !d.y.isFinite() || hypot(d.x, d.z) > PURE_YAW_MAX_TILT_HALF_SIN) return null
		return 2f * atan2(d.y, d.w)
	}

	companion object {
		/** sin(1°): tolerates < 2° of tilt change (full resets re-level, so they rarely qualify). */
		private val PURE_YAW_MAX_TILT_HALF_SIN = sin(Math.toRadians(1.0)).toFloat()
	}
}

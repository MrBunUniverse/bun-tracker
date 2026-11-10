package dev.slimevr.tracking.trackers

import io.github.axisangles.ktmath.Quaternion
import io.github.axisangles.ktmath.Vector3
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/** Body posture a reset was taken in. Decides the yaw reference and whether drift may be learned. */
enum class ResetPosture {
	UPRIGHT,
	SUPINE,
	PRONE,
	UNSAFE,
	;

	val isLying: Boolean get() = this == SUPINE || this == PRONE
}

/**
 * @property heading lying only: target heading of every segment's headward (+Y) axis,
 * `atan2(x, z)` of the HMD crown projected on the floor.
 * @property confident the reset is trustworthy enough to learn drift from.
 */
data class ResetPostureSnapshot(
	val posture: ResetPosture,
	val heading: Float = 0f,
	val confident: Boolean = true,
	val reason: String = "",
) {
	companion object {
		val UPRIGHT = ResetPostureSnapshot(ResetPosture.UPRIGHT)
		fun unsafe(reason: String) = ResetPostureSnapshot(ResetPosture.UNSAFE, confident = false, reason = reason)
	}
}

/**
 * Classifies the pose from reset-adjusted (pre-drift, unfiltered) rotations before a
 * reset mutates anything. Frame: X right, Y up, Z back; a calibrated torso/leg
 * tracker's +Y is the segment's headward axis and -Z its front.
 *
 * Thresholds are first guesses for MPU6050 trackers + SteamVR HMD; tune on hardware.
 */
object ResetPostureClassifier {
	/** Lying: torso/leg long axes and HMD crown within 25° of horizontal. */
	val LYING_MAX_ELEVATION = sin(Math.toRadians(25.0)).toFloat()

	/** Upright: HMD crown, or every calibrated torso long axis, within 25° of vertical. */
	val UPRIGHT_MIN_ELEVATION = sin(Math.toRadians(65.0)).toFloat()

	/** Lying: torso front within 30° of straight up (supine) or down (prone); rejects side-lying. */
	val LYING_MIN_FRONT_VERTICAL = cos(Math.toRadians(30.0)).toFloat()

	/** Learning from a lying reset: each correction and the spread of segment headings. */
	val LEARN_MAX_CORRECTION_RAD = Math.toRadians(15.0).toFloat()
	val LEARN_MAX_HEADING_SPREAD_RAD = Math.toRadians(15.0).toFloat()

	/** Minimum floor-projection length before normalizing a direction. */
	private const val MIN_HORIZONTAL = 0.5f

	val torsoPositions = setOf(
		TrackerPosition.UPPER_CHEST,
		TrackerPosition.CHEST,
		TrackerPosition.WAIST,
		TrackerPosition.HIP,
	)
	val legPositions = setOf(
		TrackerPosition.LEFT_UPPER_LEG,
		TrackerPosition.RIGHT_UPPER_LEG,
		TrackerPosition.LEFT_LOWER_LEG,
		TrackerPosition.RIGHT_LOWER_LEG,
	)

	/** Same chain the drift observation uses: mounting/reset-adjusted, before drift and Stay Aligned. */
	fun adjusted(t: Tracker): Quaternion? = t.resetsHandler.getReferenceAdjustedRotationBeforeDrift(t.getRawRotation())
		.takeIf { finite(it) && it.lenSq() > 0.5f }
		?.unit()

	/**
	 * @param torso every torso tracker in the skeleton (they define the posture)
	 * @param legs the leg trackers taking part in this reset
	 * @param isStill rotation-based rest signal (Stay Aligned's 2° / 1 s detector in production)
	 */
	fun classify(head: Tracker?, torso: List<Tracker>, legs: List<Tracker>, isStill: (Tracker) -> Boolean): ResetPostureSnapshot {
		val headRot = head?.takeIf { it.isHmd }?.getRotation()?.takeIf { finite(it) && it.lenSq() > 0.5f }?.unit()
		// An upright HMD is a sound yaw reference whatever the torso does: keep the legacy path.
		if (headRot != null && headRot.sandwichUnitY().y >= UPRIGHT_MIN_ELEVATION) return ResetPostureSnapshot.UPRIGHT
		// Uncalibrated trackers can't tell their tilt; judge upright from the calibrated ones.
		val calibrated = torso.filter(::isCalibrated).mapNotNull { t -> adjusted(t)?.let { t to it } }
		// No torso to judge: keep the legacy behavior.
		if (calibrated.isEmpty()) return ResetPostureSnapshot.UPRIGHT
		val elevations = calibrated.map { (_, q) -> q.sandwichUnitY().y }
		if (elevations.all { it >= UPRIGHT_MIN_ELEVATION }) return ResetPostureSnapshot.UPRIGHT
		if (!elevations.all { abs(it) <= LYING_MAX_ELEVATION }) {
			val worst = calibrated.zip(elevations).minBy { it.second }
			return ResetPostureSnapshot.unsafe("${worst.first.first.name} tilted ${deg(Math.asin(worst.second.coerceIn(-1f, 1f).toDouble()).toFloat())}° from horizontal (neither upright nor lying)")
		}

		// Lying candidate: every input must be trustworthy.
		if (head == null || !head.isHmd) return ResetPostureSnapshot.unsafe("lying reset needs an HMD head reference")
		if (headRot == null) return ResetPostureSnapshot.unsafe("HMD rotation is invalid")
		val crown = headRot.sandwichUnitY()
		if (abs(crown.y) > LYING_MAX_ELEVATION) return ResetPostureSnapshot.unsafe("HMD crown is not horizontal")
		val heading = heading(crown) ?: return ResetPostureSnapshot.unsafe("HMD crown is degenerate")
		if (!isStill(head)) return ResetPostureSnapshot.unsafe("HMD is moving")

		var frontSign = 0f
		val corrections = ArrayList<Float>()
		for (t in torso + legs) {
			if (!isCalibrated(t)) return ResetPostureSnapshot.unsafe("${t.name} needs a full reset first")
			if (t.status != TrackerStatus.OK || t.recovery.activeForSkeleton) {
				return ResetPostureSnapshot.unsafe("${t.name} is unavailable (${t.status}, recovery ${t.recovery.state})")
			}
			val q = adjusted(t) ?: return ResetPostureSnapshot.unsafe("${t.name} rotation is invalid")
			val axis = q.sandwichUnitY()
			if (abs(axis.y) > LYING_MAX_ELEVATION) return ResetPostureSnapshot.unsafe("${t.name} is not horizontal (bent knees or propped up)")
			val h = heading(axis) ?: return ResetPostureSnapshot.unsafe("${t.name} heading is degenerate")
			if (t.trackerPosition in torsoPositions) {
				val frontY = -q.sandwichUnitZ().y
				if (abs(frontY) < LYING_MIN_FRONT_VERTICAL) return ResetPostureSnapshot.unsafe("${t.name} is on its side")
				if (frontSign != 0f && frontY * frontSign < 0f) return ResetPostureSnapshot.unsafe("torso trackers disagree on facing up/down")
				frontSign = frontY
			}
			if (!isStill(t)) return ResetPostureSnapshot.unsafe("${t.name} is moving")
			corrections.add(wrap(heading - h))
		}
		val posture = if (frontSign > 0f) ResetPosture.SUPINE else ResetPosture.PRONE
		val confident = corrections.all { abs(it) <= LEARN_MAX_CORRECTION_RAD } &&
			corrections.max() - corrections.min() <= LEARN_MAX_HEADING_SPREAD_RAD
		return ResetPostureSnapshot(posture, heading, confident)
	}

	/**
	 * Rejects a full reset when the body is confidently not upright: the HMD is lying
	 * flat, or the HMD is tilted past 25° and a calibrated torso tracker agrees. A
	 * moved strap alone (HMD upright) never blocks the reset that fixes it.
	 */
	fun fullResetBlockReason(head: Tracker?, torso: List<Tracker>): String? {
		if (head == null || !head.isHmd) return null
		val headRot = head.getRotation().takeIf { finite(it) && it.lenSq() > 0.5f }?.unit() ?: return null
		val crownY = headRot.sandwichUnitY().y
		if (crownY <= LYING_MAX_ELEVATION) return "HMD is lying flat"
		if (crownY >= UPRIGHT_MIN_ELEVATION) return null
		val tilted = torso.filter(::isCalibrated).firstOrNull { t ->
			adjusted(t)?.let { it.sandwichUnitY().y < UPRIGHT_MIN_ELEVATION } == true
		}
		return tilted?.let { "HMD and ${it.name} are not upright" }
	}

	/** `atan2(x, z)` of the floor projection, or null when it is too short to normalize. */
	fun heading(v: Vector3): Float? {
		if (!v.x.isFinite() || !v.z.isFinite() || hypot(v.x, v.z) < MIN_HORIZONTAL) return null
		return atan2(v.x, v.z)
	}

	fun wrap(rad: Float): Float {
		var r = rad % (2f * PI.toFloat())
		if (r > PI.toFloat()) r -= 2f * PI.toFloat()
		if (r < -PI.toFloat()) r += 2f * PI.toFloat()
		return r
	}

	/** Reset at least once this session and not flagged for a full reset. */
	private fun isCalibrated(t: Tracker) = !t.needReset && t.resetsHandler.lastResetQuaternion != null

	private fun finite(q: Quaternion) = q.w.isFinite() && q.x.isFinite() && q.y.isFinite() && q.z.isFinite()

	private fun deg(rad: Float) = Math.toDegrees(rad.toDouble()).toInt()
}

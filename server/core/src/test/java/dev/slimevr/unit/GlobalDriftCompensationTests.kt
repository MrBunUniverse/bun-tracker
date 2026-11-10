package dev.slimevr.unit

import dev.slimevr.VRServer.Companion.getNextLocalTrackerId
import dev.slimevr.config.DriftCompensationConfig
import dev.slimevr.config.TrackerConfig
import dev.slimevr.config.config
import dev.slimevr.tracking.trackers.Tracker
import dev.slimevr.tracking.trackers.YawDriftModel
import dev.slimevr.tracking.trackers.YawDriftModel.Outcome
import dev.slimevr.tracking.trackers.udp.IMUType
import io.github.axisangles.ktmath.EulerOrder
import io.github.axisangles.ktmath.Quaternion
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertDoesNotThrow

/** Global (reset-based) drift compensation: [YawDriftModel] and its config validation. */
class GlobalDriftCompensationTests {
	private val minute = 60_000L
	private fun rad(deg: Double) = Math.toRadians(deg).toFloat()
	private fun deg(rad: Float) = Math.toDegrees(rad.toDouble())

	/** Baseline reset at t=0, then [count] resets each [stepMs] apart applying [yawDeg]. */
	private fun model(count: Int, yawDeg: Double, stepMs: Long = minute, capacity: Int = 6): Pair<YawDriftModel, Long> {
		val m = YawDriftModel(capacity)
		var now = 1_000L
		assertEquals(Outcome.BASELINE, m.onReset(0f, now))
		repeat(count) {
			now += stepMs
			assertEquals(Outcome.ADDED, m.onReset(rad(yawDeg), now))
		}
		return m to now
	}

	@Test
	fun rateDoesNotShrinkWithMoreObservations() {
		val (one, t1) = model(1, -10.0)
		val (six, t6) = model(6, -10.0)
		val c1 = deg(one.correction(t1 + minute, 0.8f, false))
		val c6 = deg(six.correction(t6 + minute, 0.8f, false))
		assertEquals(-8.0, c1, 1e-3)
		assertEquals(-8.0, c6, 1e-3)
	}

	@Test
	fun predictionExtrapolatesAndIsCapped() {
		val (m, t) = model(3, -10.0)
		// Without prediction: capped at the average interval (1 min)
		assertEquals(-10.0, deg(m.correction(t + 3 * minute, 1f, false)), 1e-3)
		// With prediction: keeps going, up to the 45° cap
		assertEquals(-30.0, deg(m.correction(t + 3 * minute, 1f, true)), 1e-3)
		assertEquals(-45.0, deg(m.correction(t + 60 * minute, 1f, true)), 1e-3)
	}

	@Test
	fun implausibleRateIsRejectedAndRebaselines() {
		val (m, t) = model(2, 5.0)
		val before = m.rateRadPerMs
		// 90° in one minute is a posture/mounting change, not gyro drift
		assertEquals(Outcome.REJECTED, m.onReset(rad(90.0), t + minute))
		assertEquals(2, m.size)
		assertEquals(before, m.rateRadPerMs)
		assertEquals(t + minute, m.intervalStart)
		// The following interval is measured from the rejected reset
		assertEquals(Outcome.ADDED, m.onReset(rad(5.0), t + 2 * minute))
	}

	@Test
	fun shortestPathYawForLargeCorrections() {
		for (d in listOf(120.0, -120.0, 179.0, -179.0, 10.0)) {
			val before = Quaternion.rotationAroundYAxis(rad(30.0))
			val after = Quaternion.rotationAroundYAxis(rad(30.0 + d))
			// Same extraction the reset handler uses, also on the long-way twin
			for (delta in listOf(after / before, -(after / before))) {
				val yaw = delta.toEulerAngles(EulerOrder.YZX).y
				assertEquals(d, deg(yaw), 1e-3, "delta $d")
				// Applying the extracted yaw reproduces the reset's correction
				val applied = Quaternion.rotationAroundYAxis(yaw) * before
				assertTrue(applied.angleToR(after) < 1e-3f, "apply $d")
			}
		}
		// A fraction of -120° stays on the -120° side (no reversal to +96°)
		val m = YawDriftModel(6)
		m.onReset(0f, 0L)
		m.onReset(rad(-12.0), 10 * minute) // -1.2°/min, plausible
		assertEquals(-4.8, deg(m.correction(20 * minute, 0.4f, false)), 1e-3)
	}

	@Test
	fun resizeKeepsNewestObservations() {
		val m = YawDriftModel(6)
		var now = 0L
		m.onReset(0f, now)
		for (yaw in listOf(1.0, 1.0, 1.0, 1.0, -4.0, -4.0)) {
			now += minute
			m.onReset(rad(yaw), now)
		}
		m.resize(2)
		assertEquals(2, m.capacity)
		assertEquals(2, m.size)
		assertEquals(-4.0, deg(m.correction(now + minute, 1f, false)), 1e-3)
		m.resize(0) // clamped, never a zero-capacity model
		assertEquals(1, m.capacity)
	}

	@Test
	fun discontinuityInvalidatesInterval() {
		val (m, t) = model(1, -2.0)
		val rate = m.rateRadPerMs
		m.invalidateInterval() // e.g. recovery realigned the tracker
		assertEquals(Outcome.BASELINE, m.onReset(rad(15.0), t + minute))
		assertEquals(1, m.size)
		assertEquals(rate, m.rateRadPerMs)
		assertEquals(Outcome.ADDED, m.onReset(rad(-2.0), t + 2 * minute))
	}

	@Test
	fun rebaseRestartsCorrectionWithoutRecording() {
		val (m, t) = model(1, -10.0)
		m.rebase(t + 10 * minute) // compensation re-enabled after an outage
		assertEquals(0.0, deg(m.correction(t + 10 * minute, 1f, true)), 1e-6)
		assertEquals(Outcome.BASELINE, m.onReset(rad(-40.0), t + 12 * minute))
		assertEquals(1, m.size)
	}

	@Test
	fun cooldownMergeAndNonPositiveDurations() {
		val (m, t) = model(1, -5.0)
		// Re-done reset 10 s later extends the last observation
		assertEquals(Outcome.MERGED, m.onReset(rad(-1.0), t + 10_000L))
		assertEquals(1, m.size)
		// Clock going nowhere is rejected
		assertEquals(Outcome.REJECTED, m.onReset(rad(-1.0), t + 10_000L))
		assertFalse(m.correction(t + 20_000L, 1f, false).isNaN())
	}

	@Test
	fun validationRejectsBadSettings() {
		assertTrue(DriftCompensationConfig.isValid(0.8f, 6))
		assertFalse(DriftCompensationConfig.isValid(0.8f, 0))
		assertFalse(DriftCompensationConfig.isValid(0.8f, 31))
		assertFalse(DriftCompensationConfig.isValid(Float.NaN, 6))
		assertFalse(DriftCompensationConfig.isValid(Float.POSITIVE_INFINITY, 6))
		assertFalse(DriftCompensationConfig.isValid(-0.1f, 6))
		assertFalse(DriftCompensationConfig.isValid(1.5f, 6))

		val loaded = DriftCompensationConfig().apply {
			amount = Float.NaN
			maxResets = 0
		}
		loaded.sanitize()
		assertEquals(DriftCompensationConfig.DEFAULT_AMOUNT, loaded.amount)
		assertEquals(1, loaded.maxResets)
	}

	@Test
	fun handlerToleratesBadConfigValues() {
		val tracker = Tracker(
			null,
			getNextLocalTrackerId(),
			"test",
			"test",
			null,
			hasRotation = true,
			imuType = IMUType.UNKNOWN,
			allowReset = true,
			allowMounting = true,
			trackRotDirection = false,
		)
		val bad = DriftCompensationConfig().apply {
			enabled = true
			amount = Float.NaN
			maxResets = 0
		}
		assertDoesNotThrow {
			tracker.resetsHandler.readDriftCompensationConfig(bad)
			tracker.setRotation(Quaternion.IDENTITY)
			repeat(3) { tracker.resetsHandler.resetFull(Quaternion.IDENTITY) }
		}
		assertTrue(tracker.getRotation().w.isFinite())
	}

	private fun imuTracker(name: String) = Tracker(
		null,
		getNextLocalTrackerId(),
		name,
		name,
		null,
		hasRotation = true,
		imuType = IMUType.MPU6050,
		allowReset = true,
		allowMounting = true,
		trackRotDirection = false,
	)

	@Test
	fun enablingGloballyOptsInAllImuTrackersOnly() {
		val optedOut = imuTracker("gdc-a").also {
			it.resetsHandler.allowDriftCompensation = false
			it.config.allowDriftCompensation = false
		}
		val fresh = imuTracker("gdc-b")
		val nonImu = Tracker(null, getNextLocalTrackerId(), "gdc-c", "gdc-c", null, hasRotation = true)
		DriftCompensationConfig().enableForAllTrackers(listOf(optedOut, fresh, nonImu))
		for (t in listOf(optedOut, fresh)) {
			assertTrue(t.resetsHandler.allowDriftCompensation)
			assertTrue(t.config.allowDriftCompensation == true)
		}
		assertFalse(nonImu.config.allowDriftCompensation == true)
	}

	@Test
	fun newImuTrackerDefaultsToAllowed() {
		assertTrue(imuTracker("gdc-d").resetsHandler.allowDriftCompensation)
		assertTrue(TrackerConfig(imuTracker("gdc-e")).allowDriftCompensation == true)
	}
}

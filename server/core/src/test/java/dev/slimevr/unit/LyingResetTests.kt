package dev.slimevr.unit

import dev.slimevr.config.DriftCompensationConfig
import dev.slimevr.tracking.processor.HumanPoseManager
import dev.slimevr.tracking.trackers.Tracker
import dev.slimevr.tracking.trackers.TrackerStatus
import io.github.axisangles.ktmath.Quaternion
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.abs
import kotlin.math.atan2

/** Posture-aware yaw/full resets and the shared drift-learning gate, on the real skeleton. */
class LyingResetTests {
	private val src = "Unit Test"
	private val minute = 60_000L
	private fun rad(deg: Double) = Math.toRadians(deg).toFloat()
	private fun deg(rad: Float) = Math.toDegrees(rad.toDouble())
	private fun ry(deg: Double) = Quaternion.rotationAroundYAxis(rad(deg))
	private fun rx(deg: Double) = Quaternion(kotlin.math.cos(rad(deg) / 2), kotlin.math.sin(rad(deg) / 2), 0f, 0f)
	private fun rz(deg: Double) = Quaternion(kotlin.math.cos(rad(deg) / 2), 0f, 0f, kotlin.math.sin(rad(deg) / 2))

	/** Supine (+90) / prone (-90) body lying along world heading [heading]: crown +Z rotated by heading. */
	private fun lying(heading: Double, pitch: Double) = ry(heading) * rx(pitch)

	private fun headingOf(q: Quaternion): Double {
		val y = q.sandwichUnitY()
		return deg(atan2(y.x, y.z))
	}

	private fun wrapDeg(d: Double): Double = ((d + 540.0) % 360.0) - 180.0

	private class Rig {
		val set = TestTrackerSet()
		val hpm = HumanPoseManager(set.allL)
		var clock = 1_000L
		val persistent = ArrayList<Pair<Float, Long>>()

		init {
			hpm.skeleton.isTrackerStill = { true }
			for (t in set.set) {
				// Identity mounting so the reset-adjusted rotation equals the raw one after calibration.
				t.resetsHandler.mountingOrientation = Quaternion.IDENTITY
				t.resetsHandler.monotonicMs = { clock }
				t.resetsHandler.persistentDriftSink = { yaw, ms -> persistent.add(yaw to ms) }
			}
			// Calibrate standing, facing the HMD (identity).
			for (t in set.all) t.setRotation(Quaternion.IDENTITY)
			hpm.resetTrackersFull("Unit Test")
		}

		fun enableDrift() {
			val config = DriftCompensationConfig().apply {
				enabled = true
				amount = 1f
			}
			for (t in set.set) {
				t.resetsHandler.driftGateOverride = true
				t.resetsHandler.readDriftCompensationConfig(config)
			}
		}

		fun pose(head: Quaternion, body: Quaternion, drift: Map<Tracker, Double> = emptyMap()) {
			set.head.setRotation(head)
			for (t in set.set) t.setRotation(Quaternion.rotationAroundYAxis(Math.toRadians(drift[t] ?: 0.0).toFloat()) * body)
		}

		fun observations() = set.set.map { it.resetsHandler.driftObservationCount }
	}

	private fun assertNear(expected: Quaternion, actual: Quaternion, what: String) {
		assertTrue(expected.angleToR(actual) < 2e-3f, "$what: expected $expected, actual $actual")
	}

	@Test
	fun lyingYawResetAlignsLongAxesToCrown() {
		for (pitch in listOf(90.0, -90.0)) {
			for (heading in listOf(0.0, 37.0, 90.0, -135.0, 180.0)) {
				for (headTurn in listOf(0.0, 45.0, -45.0)) {
					val rig = Rig()
					val drift = rig.set.set.withIndex().associate { (i, t) -> t to (i * 7.0 - 20.0) }
					rig.pose(lying(heading, pitch) * ry(headTurn), lying(heading, pitch), drift)
					val tiltsBefore = rig.set.set.map { it.getRotation().sandwichUnitY().y }
					rig.hpm.resetTrackersYaw(src)
					for ((i, t) in rig.set.set.withIndex()) {
						val ctx = "${t.name} pitch=$pitch heading=$heading turn=$headTurn"
						// Head turn must not leak in: every segment ends exactly in the lying pose.
						assertNear(lying(heading, pitch), t.getRotation(), ctx)
						assertEquals(tiltsBefore[i], t.getRotation().sandwichUnitY().y, 1e-4f, "tilt $ctx")
					}
				}
			}
		}
	}

	@Test
	fun proneCrownPointsOppositeToSupine() {
		val rig = Rig()
		rig.pose(lying(0.0, -90.0), lying(0.0, -90.0), mapOf(rig.set.chest to 10.0))
		rig.hpm.resetTrackersYaw(src)
		// Prone at heading 0: crown and torso long axis point to -Z.
		assertEquals(180.0, abs(headingOf(rig.set.chest.getRotation())), 1e-2)
		assertTrue(-rig.set.chest.getRotation().sandwichUnitZ().y < -0.99f, "front faces down")
	}

	@Test
	fun uprightYawResetUnchanged() {
		for (heading in listOf(0.0, 60.0, -100.0, 179.0)) {
			val rig = Rig()
			// Y-Z-X order has no yaw component, so the legacy reset keeps it exactly.
			val tilt = rz(-5.0) * rx(10.0)
			rig.pose(ry(heading), tilt, mapOf(rig.set.hip to 25.0, rig.set.leftThigh to -40.0))
			val tiltsBefore = rig.set.set.map { it.getRotation().sandwichUnitY() }
			rig.hpm.resetTrackersYaw(src)
			for ((i, t) in rig.set.set.withIndex()) {
				assertNear(ry(heading) * tilt, t.getRotation(), "${t.name} heading=$heading")
				assertEquals(tiltsBefore[i].y, t.getRotation().sandwichUnitY().y, 1e-4f)
			}
		}
	}

	private fun assertSkipped(rig: Rig, body: Quaternion, head: Quaternion = body, drift: Double = 20.0, what: String) {
		rig.pose(head, body, rig.set.set.associateWith { drift })
		val before = rig.set.set.map { it.getRotation() }
		rig.hpm.resetTrackersYaw(src)
		for ((i, t) in rig.set.set.withIndex()) assertNear(before[i], t.getRotation(), "$what: ${t.name} must be untouched")
	}

	@Test
	fun unsafePosesAreSkipped() {
		for (roll in listOf(90.0, -90.0)) assertSkipped(Rig(), ry(30.0) * rz(roll), what = "side-lying $roll")
		for (propped in listOf(30.0, 45.0, 60.0)) {
			// Reclined on pillows: torso and head raised [propped] degrees from horizontal.
			assertSkipped(Rig(), lying(0.0, 90.0 - propped), what = "propped $propped")
		}
		// Bent knees: thighs rise toward the knee, calves fall back to the bed.
		val rig = Rig()
		val supine = lying(0.0, 90.0)
		rig.pose(supine, supine)
		rig.set.leftThigh.setRotation(lying(0.0, 135.0))
		rig.set.leftCalf.setRotation(lying(0.0, 45.0))
		val before = rig.set.set.map { it.getRotation() }
		rig.hpm.resetTrackersYaw(src)
		for ((i, t) in rig.set.set.withIndex()) assertNear(before[i], t.getRotation(), "bent knees: ${t.name}")
	}

	@Test
	fun badInputIsSkipped() {
		val supine = lying(0.0, 90.0)
		val cases = listOf<(Rig) -> Unit>(
			{ it.set.hip.status = TrackerStatus.TIMED_OUT },
			{ it.set.hip.setRotation(Quaternion(Float.NaN, 0f, 0f, 0f)) },
			{ it.set.hip.setRotation(Quaternion(0f, 0f, 0f, 0f)) },
			{ it.set.head.setRotation(Quaternion(Float.NaN, 0f, 0f, 0f)) },
			{ it.hpm.skeleton.isTrackerStill = { t -> t !== it.set.leftCalf } },
		)
		for ((i, breakIt) in cases.withIndex()) {
			val rig = Rig()
			rig.enableDrift()
			rig.pose(supine, supine, rig.set.set.associateWith { 3.0 })
			rig.hpm.resetTrackersYaw(src) // baseline
			rig.clock += 10 * minute
			rig.pose(supine, supine, rig.set.set.associateWith { 6.0 })
			breakIt(rig)
			val chestBefore = rig.set.chest.getRotation()
			rig.hpm.resetTrackersYaw(src)
			assertNear(chestBefore, rig.set.chest.getRotation(), "case $i: no yaw applied")
			assertEquals(List(6) { 0 }, rig.observations(), "case $i")
			assertTrue(rig.persistent.isEmpty(), "case $i")
		}
	}

	@Test
	fun bothLearnersGetCorrectSignAndShortestDelta() {
		for (d in listOf(10.0, -10.0, 179.0, -179.0)) {
			for (twin in listOf(false, true)) {
				val rig = Rig()
				rig.enableDrift()
				rig.pose(Quaternion.IDENTITY, Quaternion.IDENTITY)
				rig.hpm.resetTrackersYaw(src) // baseline
				rig.clock += 10 * minute
				// Sensor drifted +d over 10 minutes; the -q twin is the same rotation.
				for (t in rig.set.set) t.setRotation(if (twin) -ry(d) else ry(d))
				rig.hpm.resetTrackersYaw(src)
				val ctx = "d=$d twin=$twin"
				for (t in rig.set.set) assertNear(Quaternion.IDENTITY, t.resetsHandler.getReferenceAdjustedRotationBeforeDrift(t.getRawRotation()), ctx)
				assertEquals(List(6) { 1 }, rig.observations(), ctx)
				// Persistent learner stores sensor drift (+d), not the correction.
				assertEquals(6, rig.persistent.size, ctx)
				for ((yaw, ms) in rig.persistent) {
					assertEquals(d, deg(yaw), 1e-2, ctx)
					assertEquals(10 * minute, ms, ctx)
				}
				// Runtime model applies the correction (-d) over the next interval.
				rig.clock += 10 * minute
				val applied = rig.set.chest.resetsHandler.globalDriftCorrectionDegrees.toDouble()
				assertEquals(wrapDeg(-d).coerceIn(-45.0, 45.0), applied, 1e-2, ctx)
			}
		}
	}

	@Test
	fun unsafeResetBetweenGoodResetsIsNotLearned() {
		val rig = Rig()
		rig.enableDrift()
		rig.pose(Quaternion.IDENTITY, Quaternion.IDENTITY)
		rig.hpm.resetTrackersYaw(src)
		rig.clock += 5 * minute
		assertSkipped(rig, ry(0.0) * rz(90.0), drift = 5.0, what = "side-lying")
		rig.clock += 5 * minute
		rig.pose(Quaternion.IDENTITY, Quaternion.IDENTITY, rig.set.set.associateWith { 10.0 })
		rig.hpm.resetTrackersYaw(src)
		assertEquals(List(6) { 0 }, rig.observations(), "interval across the unsafe reset is a baseline")
		assertTrue(rig.persistent.isEmpty())
		rig.clock += 10 * minute
		rig.pose(Quaternion.IDENTITY, Quaternion.IDENTITY, rig.set.set.associateWith { 5.0 })
		rig.hpm.resetTrackersYaw(src)
		assertEquals(List(6) { 1 }, rig.observations())
		assertEquals(6, rig.persistent.size)
	}

	@Test
	fun postureSwitchRebaselinesAndLowConfidenceLyingDoesNotLearn() {
		val rig = Rig()
		rig.enableDrift()
		val supine = lying(20.0, 90.0)
		rig.pose(Quaternion.IDENTITY, Quaternion.IDENTITY)
		rig.hpm.resetTrackersYaw(src) // upright baseline
		rig.clock += 10 * minute
		rig.pose(supine, supine, rig.set.set.associateWith { 4.0 })
		rig.hpm.resetTrackersYaw(src) // upright -> supine: baseline only
		assertEquals(List(6) { 0 }, rig.observations())
		rig.clock += 10 * minute
		rig.pose(supine, supine, rig.set.set.associateWith { 8.0 })
		rig.hpm.resetTrackersYaw(src) // supine -> supine: learned
		assertEquals(List(6) { 1 }, rig.observations())
		assertEquals(6, rig.persistent.size)
		for ((yaw, _) in rig.persistent) assertEquals(4.0, deg(yaw), 1e-2)
		// Redo within the cooldown merges in the model, never a second persistent observation.
		rig.clock += 20_000L
		rig.pose(supine, supine, rig.set.set.associateWith { 8.1 })
		rig.hpm.resetTrackersYaw(src)
		assertEquals(List(6) { 1 }, rig.observations())
		assertEquals(6, rig.persistent.size)
		// A 30° correction lying down is applied but not trusted.
		rig.clock += 10 * minute
		rig.pose(supine, supine, rig.set.set.associateWith { 38.1 })
		rig.hpm.resetTrackersYaw(src)
		for (t in rig.set.set) assertNear(supine, t.resetsHandler.getReferenceAdjustedRotationBeforeDrift(t.getRawRotation()), "applied")
		assertEquals(List(6) { 1 }, rig.observations())
		// ...so the next one is a baseline, and supine -> upright is a baseline too.
		rig.clock += 10 * minute
		rig.pose(Quaternion.IDENTITY, Quaternion.IDENTITY, rig.set.set.associateWith { 2.0 })
		rig.hpm.resetTrackersYaw(src)
		assertEquals(List(6) { 1 }, rig.observations())
		assertEquals(6, rig.persistent.size)
	}

	@Test
	fun fullResetWhileLyingIsRejected() {
		for (pitch in listOf(90.0, -90.0, 45.0)) {
			val rig = Rig()
			val body = lying(30.0, pitch)
			rig.pose(body, body, mapOf(rig.set.leftCalf to 12.0))
			val rotations = rig.set.set.map { it.getRotation() }
			val lastReset = rig.set.set.map { it.resetsHandler.lastResetQuaternion }
			rig.hpm.resetTrackersFull(src)
			for ((i, t) in rig.set.set.withIndex()) {
				assertNear(rotations[i], t.getRotation(), "pitch=$pitch ${t.name}")
				assertSame(lastReset[i], t.resetsHandler.lastResetQuaternion, "pitch=$pitch ${t.name} untouched")
			}
		}
		// Standing with a shifted strap (HMD upright) is still allowed.
		val rig = Rig()
		rig.pose(Quaternion.IDENTITY, rx(50.0))
		rig.hpm.resetTrackersFull(src)
		for (t in rig.set.set) assertNear(Quaternion.IDENTITY, t.getRotation(), "upright full reset ${t.name}")
	}
}

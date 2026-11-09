package dev.slimevr.tracking.trackers

import kotlin.math.abs

/**
 * Reset-based global drift model, kept in signed yaw angles (radians) so
 * fractional corrections always take the shortest way round.
 *
 * Each observation is the yaw correction a reset applied after an interval.
 * The estimate is a per-interval RATE (rad/ms), averaged with duration and
 * recency weights, so N identical observations give the same rate as one.
 *
 * Time is a caller-supplied monotonic clock in milliseconds. Not thread-safe:
 * only touch it from the VRServer tracking thread.
 */
internal class YawDriftModel(capacity: Int) {
	private val angles = ArrayList<Float>()
	private val durations = ArrayList<Long>()

	var capacity = capacity.coerceAtLeast(1)
		private set

	/** Weighted yaw correction rate, radians per millisecond. */
	var rateRadPerMs = 0f
		private set

	/** Weighted average observation interval, used to cap non-predictive correction. */
	var averageIntervalMs = 0f
		private set

	/** Start of the current interval (correction is applied from here), or null before the first reset. */
	var intervalStart: Long? = null
		private set

	/** False when the current interval crossed a discontinuity and must not be recorded. */
	private var intervalValid = false
	private var cooldownAnchor: Long? = null

	val size: Int get() = angles.size

	fun clear() {
		angles.clear()
		durations.clear()
		intervalStart = null
		intervalValid = false
		cooldownAnchor = null
		recompute()
	}

	/** Keeps the newest observations that fit the new capacity. */
	fun resize(newCapacity: Int) {
		capacity = newCapacity.coerceAtLeast(1)
		while (angles.size > capacity) {
			angles.removeAt(0)
			durations.removeAt(0)
		}
		recompute()
	}

	/** The current interval crossed a discontinuity; the next reset only sets a fresh baseline. */
	fun invalidateInterval() {
		intervalValid = false
	}

	/** Restarts correction from zero at [now]; the interval is not recorded. */
	fun rebase(now: Long) {
		intervalStart = now
		intervalValid = false
	}

	/** Seeds one observation (legacy adaptive migration); ignored if invalid or implausible. */
	fun seed(yawRad: Float, durationMs: Long, now: Long) {
		if (durationMs <= 0 || !isPlausible(yawRad, durationMs)) return
		add(yawRad, durationMs)
		intervalStart = now
		intervalValid = true
	}

	/**
	 * Records the yaw correction a reset just applied and starts the next interval.
	 * Resets within [COOLDOWN_MS] of the last accepted observation extend it
	 * instead of adding a new one (re-done resets). Implausible or invalid
	 * observations are dropped and only re-baseline.
	 */
	fun onReset(yawRad: Float, now: Long): Outcome {
		val start = intervalStart.takeIf { intervalValid }
		intervalStart = now
		intervalValid = true
		if (start == null) {
			cooldownAnchor = now
			return Outcome.BASELINE
		}
		val elapsed = now - start
		if (elapsed <= 0 || !yawRad.isFinite()) return Outcome.REJECTED

		val anchor = cooldownAnchor
		if (anchor != null && now - anchor < COOLDOWN_MS) {
			if (angles.isEmpty()) {
				cooldownAnchor = now
				return Outcome.BASELINE
			}
			val last = angles.lastIndex
			val mergedAngle = angles[last] + yawRad
			val mergedDuration = durations[last] + elapsed
			if (!isPlausible(mergedAngle, mergedDuration)) return Outcome.REJECTED
			angles[last] = mergedAngle
			durations[last] = mergedDuration
			recompute()
			return Outcome.MERGED
		}

		if (!isPlausible(yawRad, elapsed)) return Outcome.REJECTED
		add(yawRad, elapsed)
		cooldownAnchor = now
		return Outcome.ADDED
	}

	/** Yaw correction to apply at [now], in radians, clamped to ±[MAX_CORRECTION_RAD]. */
	fun correction(now: Long, amount: Float, prediction: Boolean): Float {
		val start = intervalStart ?: return 0f
		if (angles.isEmpty()) return 0f
		var elapsed = (now - start).coerceAtLeast(0L).toFloat()
		if (!prediction) elapsed = minOf(elapsed, averageIntervalMs)
		return (rateRadPerMs * elapsed * amount).coerceIn(-MAX_CORRECTION_RAD, MAX_CORRECTION_RAD)
	}

	private fun add(yawRad: Float, durationMs: Long) {
		if (angles.size >= capacity) {
			angles.removeAt(0)
			durations.removeAt(0)
		}
		angles.add(yawRad)
		durations.add(durationMs)
		recompute()
	}

	private fun recompute() {
		val total = durations.sum().toFloat()
		if (angles.isEmpty() || total <= 0f) {
			rateRadPerMs = 0f
			averageIntervalMs = 0f
			return
		}
		// Duration weights, then shift weight toward newer observations (same
		// recency scheme the original quaternion average used).
		val weights = FloatArray(durations.size) { durations[it] / total }
		for (i in weights.size - 1 downTo 1) {
			val moved = weights[i - 1] / weights.size
			weights[i] += moved
			weights[i - 1] -= moved
		}
		var rate = 0f
		var interval = 0f
		for (i in weights.indices) {
			rate += weights[i] * (angles[i] / durations[i])
			interval += weights[i] * durations[i]
		}
		rateRadPerMs = rate
		averageIntervalMs = interval
	}

	enum class Outcome { BASELINE, ADDED, MERGED, REJECTED }

	companion object {
		const val COOLDOWN_MS = 50_000L

		/** Above this the "drift" is much more likely a posture/mounting change. Matches the adaptive filter. */
		const val MAX_RATE_DEG_PER_MIN = 20f

		/** Cap on the applied correction (mainly bounds prediction's extrapolation). */
		val MAX_CORRECTION_RAD = Math.toRadians(45.0).toFloat()

		fun isPlausible(yawRad: Float, durationMs: Long): Boolean {
			if (!yawRad.isFinite() || durationMs <= 0) return false
			val degPerMin = Math.toDegrees(yawRad.toDouble()) / (durationMs / 60_000.0)
			return abs(degPerMin) <= MAX_RATE_DEG_PER_MIN
		}
	}
}

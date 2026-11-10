package dev.slimevr.config

import dev.slimevr.VRServer
import dev.slimevr.tracking.trackers.Tracker

class DriftCompensationConfig {

	// Is drift compensation enabled
	var enabled = false

	// Is drift prediction enabled
	var prediction = false

	// Amount of drift compensation applied
	var amount = DEFAULT_AMOUNT

	// Max resets for the calculated average drift
	var maxResets = DEFAULT_MAX_RESETS

	/** Repairs values loaded from YAML so they can't break the tracking loop. */
	fun sanitize() {
		amount = if (amount.isFinite()) amount.coerceIn(MIN_AMOUNT, MAX_AMOUNT) else DEFAULT_AMOUNT
		maxResets = maxResets.coerceIn(MIN_MAX_RESETS, MAX_MAX_RESETS)
	}

	/** Opts every IMU tracker in (runtime and saved config); tracking thread only. */
	fun enableForAllTrackers(trackers: Iterable<Tracker> = VRServer.instance.allTrackers) {
		for (t in trackers) {
			if (!t.isImu()) continue
			t.resetsHandler.allowDriftCompensation = true
			t.config.allowDriftCompensation = true
		}
	}

	fun updateTrackersDriftCompensation() {
		for (t in VRServer.instance.allTrackers) {
			if (t.isImu()) {
				t.resetsHandler.readDriftCompensationConfig(this)
			}
		}
	}

	companion object {
		const val DEFAULT_AMOUNT = 0.8f
		const val DEFAULT_MAX_RESETS = 6
		const val MIN_AMOUNT = 0f
		const val MAX_AMOUNT = 1f
		const val MIN_MAX_RESETS = 1
		const val MAX_MAX_RESETS = 30

		fun isValid(amount: Float, maxResets: Int): Boolean = amount.isFinite() &&
			amount in MIN_AMOUNT..MAX_AMOUNT &&
			maxResets in MIN_MAX_RESETS..MAX_MAX_RESETS
	}
}

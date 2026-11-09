import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitPendingEdits } from '../src/utils/pending-settings-edits.ts';

test('a partial response only flushes edits for sections it carries', () => {
  const edits = new Map<string, unknown>([
    ['driftCompensation.amount', 0.5],
    ['trackers.waist', true],
  ]);
  // SteamVR-only broadcast: maps to the `trackers` form section
  const { ready, waiting } = splitPendingEdits(
    edits,
    new Set(['trackers', 'telemetry'])
  );
  assert.deepEqual([...ready.keys()], ['trackers.waist']);
  assert.deepEqual([...waiting.keys()], ['driftCompensation.amount']);
});

test('a full response flushes everything', () => {
  const edits = new Map([['driftCompensation.maxResets', 6]]);
  const { ready, waiting } = splitPendingEdits(
    edits,
    new Set(['driftCompensation', 'trackers'])
  );
  assert.equal(ready.get('driftCompensation.maxResets'), 6);
  assert.equal(waiting.size, 0);
});

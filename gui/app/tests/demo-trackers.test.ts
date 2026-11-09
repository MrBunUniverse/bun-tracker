import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The demo set imports the protocol and jotai, so it is read as source: one entry per createMockTracker call.
const source = fs.readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/store/demo-trackers.ts'
  ),
  'utf-8'
);
const setSource = source.slice(source.indexOf('export const DEMO_TRACKERS_SET'));
const entries = [...setSource.matchAll(/createMockTracker\(\{([\s\S]*?)\}\)/g)].map(
  ([, body]) => ({
    id: Number(body.match(/\bid: (\d+)/)?.[1]),
    name: body.match(/\bname: '([^']+)'/)?.[1],
    bodyPart: body.match(/bodyPart: BodyPart\.(\w+)/)?.[1],
    battery: Number(body.match(/batteryPct: (\d+)/)?.[1]),
    status: body.match(/status: TrackerStatus\.(\w+)/)?.[1] ?? 'OK',
    isImu: !/isImu: false/.test(body),
  })
);

test('demo mode shows the headset and both controllers as non-IMU VR devices', () => {
  const vr = Object.fromEntries(
    entries.filter((e) => !e.isImu).map((e) => [e.bodyPart, e.name])
  );
  assert.deepEqual(vr, {
    HEAD: 'VR Headset',
    LEFT_HAND: 'Left Controller',
    RIGHT_HAND: 'Right Controller',
  });
  for (const e of entries.filter((e) => !e.isImu)) {
    assert.equal(e.status, 'OK', e.name);
    assert.ok(e.battery > 0, e.name);
  }
});

test('demo body trackers keep their roles, batteries and statuses', () => {
  const body = entries
    .filter((e) => e.isImu)
    .map((e) => `${e.id} ${e.bodyPart} ${e.battery} ${e.status}`);
  assert.deepEqual(body, [
    '1 CHEST 95 OK',
    '2 HIP 85 OK',
    '3 LEFT_UPPER_LEG 72 OK',
    '4 RIGHT_UPPER_LEG 48 OK',
    '5 LEFT_LOWER_LEG 28 OK',
    '6 RIGHT_LOWER_LEG 12 OK',
    '7 LEFT_FOOT 0 OK',
    '8 RIGHT_FOOT 0 DISCONNECTED',
  ]);
});

test('every demo tracker is assigned, distinct and gets its own card', () => {
  assert.equal(entries.length, 11);
  assert.equal(new Set(entries.map((e) => e.id)).size, entries.length);
  assert.equal(new Set(entries.map((e) => e.bodyPart)).size, entries.length);
  // Assigned trackers are those with a body part other than NONE; the home grid shows them all.
  assert.ok(entries.every((e) => e.bodyPart && e.bodyPart !== 'NONE'));
});

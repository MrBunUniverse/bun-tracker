import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HeartModel } from '../src/utils/adaptive-bpm.ts';

// Park-Miller generator so the heart's wobble is the same on every run.
const seeded = (seed: number) => () =>
  (seed = (seed * 16807) % 2147483647) / 2147483647;
const upright = { x: 0, y: 0, z: 0, w: 1 };
const horizontal = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };
function pose(torso = upright, thigh = upright, rotation = upright) {
  return [
    { id: 'torso', role: 'torso' as const, rotation, postureRotation: torso },
    { id: 'thigh', role: 'thigh' as const, rotation, postureRotation: thigh },
  ];
}
function feed(
  model: HeartModel,
  start: number,
  end: number,
  moving = false,
  interval = 100
) {
  for (let time = start; time <= end; time += interval) {
    const angle = moving ? (time / 1000) * 3 : 0;
    model.sample(
      pose(upright, upright, {
        x: 0,
        y: Math.sin(angle / 2),
        z: 0,
        w: Math.cos(angle / 2),
      }),
      time
    );
    model.step(time);
  }
}

test('recognizes sustained standing, sitting and lying down without a headset', () => {
  const model = new HeartModel(seeded(7));
  feed(model, 0, 4000);
  assert.equal(model.snapshot(4000).posture, 'Standing');
  for (let t = 4100; t <= 8000; t += 100) model.sample(pose(upright, horizontal), t);
  assert.equal(model.snapshot(8000).posture, 'Sitting');
  for (let t = 8100; t <= 12000; t += 100)
    model.sample(pose(horizontal, horizontal), t);
  assert.equal(model.snapshot(12000).posture, 'Lying down');
});

test('brief bends do not switch posture, missing calibrated limbs report unknown', () => {
  const model = new HeartModel(seeded(7));
  feed(model, 0, 4000);
  model.sample(pose(upright, horizontal), 4100);
  assert.equal(model.snapshot(4100).posture, 'Standing');
  // Posture changes only after the candidate holds for 2.5 s, so a lost limb still reads Standing at first.
  model.sample([{ id: 'hand', role: 'other', rotation: upright }], 4200);
  assert.equal(model.snapshot(4200).posture, 'Standing');
  for (let t = 4300; t <= 7000; t += 100)
    model.sample([{ id: 'hand', role: 'other', rotation: upright }], t);
  assert.equal(model.snapshot(7000).posture, 'Unknown posture');
});

test('sustained movement raises BPM, rest recovers gradually, output stays bounded', () => {
  const model = new HeartModel(seeded(7));
  feed(model, 0, 30000);
  const rest = model.snapshot(30000).bpm;
  // The slow effort response builds over minutes; use sustained exercise, not a 30 s burst.
  feed(model, 30100, 210100, true);
  const peak = model.snapshot(210100).bpm;
  assert.ok(peak > rest + 40);
  assert.ok(peak <= 160);
  feed(model, 210200, 215200);
  assert.ok(model.snapshot(215200).bpm > rest + 20);
  // Recovery uses a 100 s time constant; allow six minutes to approach baseline.
  feed(model, 215300, 575300);
  assert.ok(model.snapshot(575300).bpm < peak - 40);
  assert.ok(model.snapshot(575300).bpm < rest + 12);
});

test('stale, disconnected and invalid data are unavailable; reconnection has no motion spike', () => {
  const model = new HeartModel(seeded(7));
  feed(model, 0, 4000);
  assert.equal(model.snapshot(6001).available, false);
  model.sample(pose(upright, upright, horizontal), 7000);
  assert.equal(model.snapshot(7000).intensity, 0);
  model.sample([], 7100);
  assert.equal(model.snapshot(7100).available, false);
  model.sample([{ id: 'bad', role: 'other', rotation: { ...upright, x: NaN } }], 7200);
  assert.equal(model.snapshot(7200).available, false);
});

test('quaternion sign flips do not count as movement', () => {
  const model = new HeartModel(seeded(7));
  for (let t = 0; t <= 10000; t += 100)
    model.sample(pose(upright, upright, { ...upright, w: t % 200 ? -1 : 1 }), t);
  assert.equal(model.snapshot(10000).intensity, 0);
});

test('motion estimates are comparable at different feed rates', () => {
  const slow = new HeartModel(seeded(7));
  const fast = new HeartModel(seeded(7));
  feed(slow, 0, 30000, true, 100);
  feed(fast, 0, 30000, true, 20);
  // Compare the motion estimate; BPM also carries per-step random drift that differs with sample count.
  assert.ok(
    Math.abs(slow.snapshot(30000).intensity - fast.snapshot(30000).intensity) <= 2
  );
});

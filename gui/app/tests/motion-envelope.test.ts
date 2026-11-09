import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMotionMeter,
  DEMO_EPISODE_MS,
  demoEpisodeOffset,
  sampleDemoScene,
  demoPeak,
  isMovingLevel,
  meterFresh,
  meterSample,
  rotationAngle,
  staticLevel,
  stepEnvelope,
  glowStep,
  STALE_MS,
  type Quat,
  type Vec3,
} from '../src/utils/motion-envelope.ts';

const yaw = (rad: number): Quat => ({
  x: 0,
  y: Math.sin(rad / 2),
  z: 0,
  w: Math.cos(rad / 2),
});

/** Feeds a steady yaw turn at `degPerSec` for `ms` at `hz`; returns the last target. */
function turn(degPerSec: number, hz: number, ms = 1000, acc?: (i: number) => Vec3) {
  const m = createMotionMeter();
  const dt = 1000 / hz;
  let target = 0;
  for (let i = 0, t = 0; t <= ms; i++, t += dt) {
    target = meterSample(
      m,
      t,
      yaw(((degPerSec * Math.PI) / 180) * (t / 1000)),
      acc?.(i)
    );
  }
  return target;
}

/** Runs the envelope toward `target` for `ms`, ticking every `tick` ms. */
function settle(level: number, target: number, ms: number, tick = 33) {
  for (let t = 0; t < ms; t += tick) level = stepEnvelope(level, target, tick);
  return level;
}

test('rotation angle is sign-agnostic and tolerates unnormalised quaternions', () => {
  assert.ok(Math.abs(rotationAngle(yaw(0), yaw(1)) - 1) < 1e-9);
  const q = yaw(0.5);
  assert.ok(
    Math.abs(rotationAngle({ x: -q.x, y: -q.y, z: -q.z, w: -q.w }, yaw(0)) - 0.5) < 1e-9
  );
  assert.ok(Math.abs(rotationAngle({ x: 0, y: 0, z: 0, w: 3 }, yaw(0.2)) - 0.2) < 1e-9);
  assert.equal(rotationAngle({ x: 0, y: 0, z: 0, w: 0 }, yaw(1)), 0);
});

test('a still tracker with IMU jitter and an acceleration bias stays dark', () => {
  const m = createMotionMeter();
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  let target = 0;
  for (let t = 0; t <= 3000; t += 1000 / 90) {
    // ±0.4° orientation noise and a constant 0.6 m/s² gravity-removal bias with ±1 noise.
    const q = yaw(((0.4 * Math.PI) / 180) * noise());
    target = Math.max(
      target,
      meterSample(m, t, q, { x: 0.6 + noise(), y: noise(), z: 0 })
    );
  }
  assert.equal(target, 0);
});

test('activity rises monotonically from a faint small turn to a saturated swing', () => {
  const levels = [10, 20, 30, 90, 180, 400].map((d) => turn(d, 40));
  assert.equal(levels[0], 0, 'drift-speed turns are below the dead zone');
  assert.ok(levels[1] > 0.05 && levels[1] < 0.2, `small turn is faint: ${levels[1]}`);
  assert.ok(
    levels[3] > 0.4 && levels[3] < 0.8,
    `moderate turn is mid-range: ${levels[3]}`
  );
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] >= levels[i - 1], `${i}`);
  assert.equal(levels[5], 1, 'clamped at 1');
});

test('the same movement reads the same at 10, 40 and 90 samples per second', () => {
  for (const deg of [10, 45, 120]) {
    const rates = [10, 40, 90].map((hz) => turn(deg, hz));
    const spread = Math.max(...rates) - Math.min(...rates);
    assert.ok(spread < 0.03, `${deg}°/s: ${rates.join(', ')}`);
  }
});

test('acceleration alone lights the rim and missing acceleration is ignored', () => {
  const m = createMotionMeter();
  meterSample(m, 0, yaw(0), { x: 0, y: 0, z: 0 });
  assert.ok(meterSample(m, 25, yaw(0), { x: 6, y: 0, z: 0 }) > 0.4);
  const vr = turn(45, 40, 1000, () => null as unknown as Vec3);
  assert.equal(vr, turn(45, 40), 'headsets without acceleration use rotation alone');
  const bad = createMotionMeter();
  meterSample(bad, 0, yaw(0), null);
  assert.equal(meterSample(bad, 200, { x: NaN, y: 0, z: 0, w: 1 }, null), 0);
});

test('a feed gap counts as stale and does not read as one big turn', () => {
  const m = createMotionMeter();
  meterSample(m, 0, yaw(0));
  assert.ok(meterFresh(m, STALE_MS));
  assert.ok(!meterFresh(m, STALE_MS + 1));
  // 90° rotated across a 2 s gap: the first sample after it starts fresh.
  assert.equal(meterSample(m, 2000, yaw(Math.PI / 2)), 0);
});

test('the envelope rises quickly, falls gently, settles to zero and ignores the tick rate', () => {
  const up = settle(0, 1, 150);
  assert.ok(up > 0.85, `rise: ${up}`);
  const down = settle(1, 0, 150);
  assert.ok(down > 0.6, `fall is gentler: ${down}`);
  assert.equal(settle(1, 0, 4000), 0, 'decays fully, never frozen');
  const coarse = settle(0, 0.6, 330, 110);
  const fine = settle(0, 0.6, 330, 11);
  assert.ok(Math.abs(coarse - fine) < 1e-9);
  assert.equal(stepEnvelope(0.4, 2, 0), 0.4, 'zero dt changes nothing');
  assert.ok(settle(0, 2, 2000) <= 1, 'target is clamped');
});

test('the moving state uses hysteresis and still mode uses a few static steps', () => {
  assert.equal(isMovingLevel(0.15, false), false);
  assert.equal(isMovingLevel(0.15, true), true);
  assert.equal(isMovingLevel(0.08, true), false);
  assert.deepEqual([0, 0.02, 0.1, 0.5, 0.95].map(staticLevel), [0, 0, 0.2, 0.55, 0.9]);
});

test('demo peaks cover faint to strong for every tracker', () => {
  for (const id of [1, 9, 11]) {
    const peaks = [0, 1, 2, 3, 4, 5, 6, 7].map((e) => demoPeak(id, e));
    assert.ok(Math.min(...peaks) <= 0.2 && Math.max(...peaks) > 0.9, `${id}: ${peaks}`);
    // A strong gesture is an occasional event: one episode in eight, never most of them.
    assert.equal(peaks.filter((p) => p > 0.9).length, 1, `${id}: ${peaks}`);
    assert.ok(peaks.filter((p) => p >= 0.4 && p <= 0.75).length >= 3, `${id}: ${peaks}`);
  }
});

const sceneAt = (id: number, from: number, to: number, step = 10) => {
  const out = [];
  for (let t = from; t < to; t += step) out.push({ t, ...sampleDemoScene(id, t) });
  return out;
};
const episodeOf = (id: number, t: number) =>
  Math.floor((t - demoEpisodeOffset(id)) / DEMO_EPISODE_MS);

test('demo scene is deterministic and stays inside its bounds for every card', () => {
  for (const id of [1, 2, 3, 9, 10, 11]) {
    for (const s of sceneAt(id, -20000, 40000, 37)) {
      assert.deepEqual(sampleDemoScene(id, s.t), sampleDemoScene(id, s.t));
      assert.ok(Math.abs(s.rot) <= 1 && s.shift >= 0 && s.shift <= 1, `${id}@${s.t}`);
      assert.ok(
        s.activity >= 0 && s.activity <= demoPeak(id, episodeOf(id, s.t)) + 1e-9
      );
    }
  }
});

test('demo activity follows pose change: holds are quiet, moves light the rim', () => {
  for (const id of [1, 4, 9]) {
    const f = sceneAt(id, 0, 60000, 10);
    let lit = 0;
    let quiet = 0;
    for (let i = 4; i < f.length - 1; i++) {
      const moved = (a: number, b: number) =>
        Math.abs(f[a].rot - f[b].rot) > 1e-9 ||
        Math.abs(f[a].shift - f[b].shift) > 1e-9;
      if (!moved(i - 4, i)) {
        assert.ok(f[i].activity < 1e-6, `${id}@${f[i].t}: lit while perfectly still`);
        quiet++;
      }
      if (Math.abs(f[i].rot - f[i - 1].rot) > 0.01) {
        assert.ok(f[i].activity > 0, `${id}@${f[i].t}: turning in the dark`);
        lit++;
      }
    }
    assert.ok(lit > 100 && quiet > 100, `${id}: lit ${lit}, quiet ${quiet}`);
  }
});

test('every demo card starts a gesture about every two seconds, with short rests and no pinned glow', () => {
  for (let id = 1; id <= 11; id++) {
    const f = sceneAt(id, 0, 60000, 10);
    let starts = 0;
    let rest = 0;
    let run = 0;
    let longest = 0;
    let atMax = 0;
    for (let i = 4; i < f.length; i++) {
      const still = f[i].rot === f[i - 4].rot && f[i].shift === f[i - 4].shift;
      if (still) {
        rest++;
        run++;
        longest = Math.max(longest, run);
      } else {
        // A pause of 300 ms or more starts a new gesture; a hold inside one is shorter than that.
        if (run >= 30) starts++;
        run = 0;
      }
      if (f[i].activity >= 0.9 * demoPeak(id, episodeOf(id, f[i].t))) atMax++;
    }
    const n = f.length - 4;
    assert.ok(starts >= 27, `${id}: ${starts} gestures in 60 s`);
    assert.ok(longest <= 60, `${id}: rest of ${longest * 10} ms`);
    assert.ok(rest / n <= 0.45, `${id}: at rest ${((100 * rest) / n).toFixed(0)}%`);
    assert.ok(
      atMax / n <= 0.25,
      `${id}: at max glow ${((100 * atMax) / n).toFixed(0)}%`
    );
  }
});

test('stronger episodes turn further and light brighter; faint ones stay small', () => {
  const id = 1;
  const stats = [0, 1, 2, 3, 4, 5, 6, 7].map((e) => {
    const from = demoEpisodeOffset(id) + e * DEMO_EPISODE_MS;
    const f = sceneAt(id, from, from + DEMO_EPISODE_MS, 5);
    return {
      peak: demoPeak(id, e),
      turn: Math.max(...f.map((x) => Math.abs(x.rot))),
      light: Math.max(...f.map((x) => x.activity)),
    };
  });
  const byPeak = [...stats].sort((a, b) => a.peak - b.peak);
  // Different gesture shapes cap the light below the peak; the order across peaks must still hold.
  for (let i = 1; i < byPeak.length; i++) {
    assert.ok(byPeak[i].light > byPeak[i - 1].light, JSON.stringify(byPeak));
  }
  assert.ok(
    byPeak[0].light <= 0.2 + 1e-9 && byPeak[7].light > 0.6,
    JSON.stringify(byPeak)
  );
  assert.ok(byPeak[0].turn < byPeak[7].turn);
});

test('strong gestures are occasional and reach is capped per tracker', () => {
  const peakOf = (id: number, reach: number, e: number) => {
    const from = demoEpisodeOffset(id) + e * DEMO_EPISODE_MS;
    let max = 0;
    for (let t = from; t < from + DEMO_EPISODE_MS; t += 5)
      max = Math.max(max, sampleDemoScene(id, t, reach).activity);
    return max;
  };
  for (const id of [1, 2, 7]) {
    const full = [...Array(16).keys()].map((e) => peakOf(id, 1, e));
    const strong = full.filter((l) => l > 0.75).length;
    assert.ok(strong >= 1 && strong <= 4, `${id}: ${strong}/16 strong: ${full}`);
    assert.ok(full.filter((l) => l > 0.25).length >= 8, `${id}: mostly invisible: ${full}`);
    // A headset (reach 0.55) never reaches the controller's strongest light.
    const calm = [...Array(16).keys()].map((e) => peakOf(id, 0.55, e));
    assert.ok(Math.max(...calm) <= 0.55 + 1e-9, `${id}: ${calm}`);
    calm.forEach((l, e) => assert.ok(l <= full[e] + 1e-9));
  }
});

test('cards have their own phases and gestures; the scene is one pure function of the clock', () => {
  const sig = (id: number) =>
    sceneAt(id, 0, 15000, 50)
      .map((s) => s.rot.toFixed(3))
      .join();
  const sigs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(sig);
  assert.equal(new Set(sigs).size, sigs.length, 'no two cards move in step');
  // Episodes join at rest, so a boundary never jumps.
  for (const id of [1, 6]) {
    for (let e = 1; e < 6; e++) {
      const t = demoEpisodeOffset(id) + e * DEMO_EPISODE_MS;
      assert.equal(sampleDemoScene(id, t - 1).rot, 0);
      assert.equal(sampleDemoScene(id, t).rot, 0);
    }
  }
});

test('a demo-driven card lights its rim from dark', () => {
  // Regression: the demo scheduler ticks a card that has no ticker of its own. Treating it as idle reset its
  // clock every frame, so the level stayed at 0 and the rim and shade never lit.
  const run = (ticking: boolean) => {
    let level = 0;
    let at = 0;
    for (let now = 33; now <= 330; now += 33) {
      level = glowStep(level, 0.8, at, now, ticking);
      at = now;
    }
    return level;
  };
  assert.ok(run(true) > 0.7, 'a ticked card rises to its target');
  // Without a ticker, a dark card takes no step from an idle gap.
  assert.equal(glowStep(0, 1, 0, 5000, false), 0);
  assert.ok(glowStep(0.3, 1, 0, 33, false) > 0.3, 'a lit card keeps stepping');
});

test('a strong demo episode turns about twice as far as a faint one', () => {
  const widest = (id: number, e: number) => {
    let max = 0;
    const start = demoEpisodeOffset(id) + e * DEMO_EPISODE_MS;
    for (let t = start; t < start + DEMO_EPISODE_MS; t += 10)
      max = Math.max(max, Math.abs(sampleDemoScene(id, t).rot));
    return max;
  };
  // Tracker 1, same gesture shape both times: episode 2 has the strongest peak (0.95), episode -1 the faintest (0.2).
  assert.ok(widest(1, 2) > 0.85, 'a strong move uses most of the card turn');
  assert.ok(widest(1, 2) > 1.4 * widest(1, -1), 'a faint move stays smaller');
});

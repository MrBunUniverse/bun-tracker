import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CALM_CLOUDS,
  CLOUD_SHAPES,
  GUST_SLOT,
  LANE_ROWS,
  MAX_GUST_DOTS,
  RAIN_LIFE,
  RAIN_SLOT,
  STORMS,
  TRAIL,
  STIR_MAX,
  STIR_RADIUS,
  cloudField,
  createStir,
  gustEvent,
  gustLife,
  laneLength,
  laneSpeed,
  parseCloud,
  rainEvent,
  relaxStir,
  stampCloud,
  stir,
  warpField,
  weatherFields,
} from '../src/components/commons/cloud-field.ts';

const sum = (f: Float32Array) => f.reduce((n, v) => n + v, 0);
// Brightness-weighted mean column of the rows in [top, top + LANE_ROWS).
const laneCenter = (f: Float32Array, cols: number, top: number) => {
  let n = 0;
  let m = 0;
  for (let y = top; y < top + LANE_ROWS; y++) {
    for (let x = 0; x < cols; x++) {
      n += f[y * cols + x];
      m += f[y * cols + x] * x;
    }
  }
  return m / n;
};

test('a cloud bitmap lights its top edge and shades its underside', () => {
  const s = parseCloud(['.#.', '###', '###']);
  assert.equal(s.w, 3);
  assert.equal(s.h, 3);
  const [rim, body, belly] = [s.mask[1], s.mask[4], s.mask[7]];
  assert.equal(s.mask[0], 0);
  assert.equal(s.mask[3], rim); // nothing above it
  assert.ok(rim > body && body > belly && belly > 0);
});

test('there are several distinct cloud shapes of different sizes', () => {
  assert.ok(CLOUD_SHAPES.length >= 5);
  const sizes = new Set(CLOUD_SHAPES.map((s) => `${s.w}x${s.h}`));
  assert.equal(sizes.size, CLOUD_SHAPES.length);
  for (const s of CLOUD_SHAPES) {
    // Wider than tall, flat-bottomed, and mostly filled: reads as a cloud, not a speck or a line.
    assert.ok(s.w > s.h && s.h >= 3);
    const lit = s.mask.filter((v) => v > 0).length;
    assert.ok(lit / (s.w * s.h) > 0.5, `${s.w}x${s.h} too sparse`);
    const bottom = s.mask.subarray((s.h - 1) * s.w);
    assert.ok(bottom.filter((v) => v > 0).length >= s.w / 2);
  }
});

test('the scene is the same every time and stays in range', () => {
  const a = cloudField(80, 60, 12.5);
  const b = cloudField(80, 60, 12.5, new Float32Array(80 * 60).fill(9));
  assert.deepEqual(a, b);
  assert.ok(a.every((v) => v >= 0 && v <= 1));
});

test('narrow and wide windows both show clouds in every lane', () => {
  for (const [cols, rows] of [
    [28, 60],
    [60, 80],
    [200, 70],
  ]) {
    const f = cloudField(cols, rows, 30);
    for (let top = 3; top + LANE_ROWS <= rows; top += LANE_ROWS) {
      // Over a lap of the lane, every lane shows a cloud at some point; most of the time it shows one.
      let shown = 0;
      for (let t = 0; t < 200; t += 5) {
        const g = cloudField(cols, rows, t);
        if (g.subarray(top * cols, (top + LANE_ROWS) * cols).some((v) => v > 0.5))
          shown++;
      }
      assert.ok(shown > 0, `${cols}x${rows} lane at ${top} never has a cloud`);
    }
    assert.ok(sum(f) > 0, `${cols}x${rows} is empty`);
  }
});

test('clouds drift right without flicker and wrap seamlessly', () => {
  const cols = 160;
  const rows = 40;
  const t = 40;
  const a = cloudField(cols, rows, t);
  const b = cloudField(cols, rows, t + 1 / 24);
  // Consecutive frames: total light barely changes, and no cell jumps.
  assert.ok(Math.abs(sum(a) - sum(b)) / sum(a) < 0.02);
  // No cell moves more than the fastest lane's step in one frame (a hard edge sliding by).
  assert.ok(a.every((v, i) => Math.abs(v - b[i]) < (laneSpeed(2) / 24) * 1.1));
  // A couple of seconds later the light in the first lane has moved right.
  const c = cloudField(cols, rows, t + 2);
  assert.ok(laneCenter(c, cols, 3) > laneCenter(a, cols, 3));
  // After a whole lap the first lane looks exactly the same again.
  const lap = laneLength(0) / laneSpeed(0);
  const d = cloudField(cols, rows, t + lap);
  for (let i = 3 * cols; i < (3 + LANE_ROWS) * cols; i++) {
    assert.ok(Math.abs(a[i] - d[i]) < 1e-3);
  }
});

test('calm profile: only every other lane, drifting at 60% of the welcome speed', () => {
  const cols = 120;
  const rows = 110; // lane bands start at rows 3, 35, 67 and 99 (FIRST_ROW = 3)
  const t = 17.3;
  const calm = cloudField(cols, rows, t, undefined, CALM_CLOUDS);
  const slow = cloudField(cols, rows, t * CALM_CLOUDS.speed);
  assert.ok(sum(calm) > 0);
  for (let y = 0; y < rows; y++) {
    const lane = Math.floor((y - 3) / LANE_ROWS);
    const drawn = lane >= 0 && lane % CALM_CLOUDS.laneStep === 0;
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      assert.ok(Math.abs(calm[i] - (drawn ? slow[i] : 0)) < 1e-5, `${x},${y}`);
    }
  }
});

test('a cloud trails dots to its left that fade with distance', () => {
  const cols = 30;
  const f = new Float32Array(cols * 4);
  // A solid 4x2 block with its head at column 12, on rows 1 and 2.
  stampCloud(f, cols, 4, parseCloud(['####', '####']), 12, 1);
  const at = (x: number, y: number) => f[y * cols + x];
  assert.equal(at(12, 1), 1); // the head is solid
  assert.equal(at(16, 1), 0); // nothing ahead of the head
  assert.equal(at(12 - TRAIL - 1, 1), 0); // the trail stops after TRAIL cells
  for (let x = 12 - TRAIL; x < 12; x++) {
    // Only every other cell of the fixed grid is lit in the trail.
    if ((x + 1) % 2) assert.equal(at(x, 1), 0, `cell ${x} should be dark`);
  }
  // Brightness falls off with distance behind the head.
  assert.ok(at(11, 1) > at(9, 1) && at(9, 1) > at(7, 1) && at(7, 1) > 0);
});

test('lanes drift visibly faster than a crawl, but not in a hurry', () => {
  // Cells per second. On the 8 px grid, 2 cells a second is 16 px a second, 4 is 32.
  for (let lane = 0; lane < 4; lane++) {
    assert.ok(laneSpeed(lane) >= 2 && laneSpeed(lane) <= 4);
  }
  // A new shape drifts into the first lane often enough to notice (a cloud is at most ~50 cells).
  const secondsPerShape = laneLength(0) / laneSpeed(0) / 2;
  assert.ok(secondsPerShape < 30);
});

const SEEDS = [1, 7, 12345, 0xdeadbeef];
const HOUR = 3600;

test('rain clouds are rare, last a while, and never overlap', () => {
  for (const seed of SEEDS) {
    let wet = 0;
    const starts: number[] = [];
    let prev = false;
    for (let t = 0; t < 24 * HOUR; t += 1) {
      const e = rainEvent(t, seed);
      if (e) wet++;
      if (e && !prev) starts.push(t);
      prev = e !== null;
    }
    const share = wet / (24 * HOUR);
    assert.ok(
      share > 0.04 && share < 0.16,
      `seed ${seed}: raining ${share} of the time`
    );
    // Every cloud lives its full life, at most one per slot, so starts are well apart.
    assert.equal(wet, starts.length * RAIN_LIFE);
    const gaps = starts.slice(1).map((t, i) => t - starts[i]);
    assert.ok(Math.min(...gaps) >= RAIN_LIFE);
    assert.ok(starts.length / 24 < 12, 'fewer than 12 an hour on average');
  }
});

test('gusts come and go, are shorter than rain, and fit in their slot', () => {
  for (const cols of [28, 160, 480]) assert.ok(gustLife(cols) < GUST_SLOT);
  let seen = 0;
  for (let t = 0; t < HOUR; t += 0.5) if (gustEvent(t, 3, 160)) seen++;
  const share = seen / (HOUR * 2);
  assert.ok(share > 0.15 && share < 0.5, `gust share ${share}`);
  assert.ok(gustLife(160) < RAIN_LIFE / 2);
});

test('weather is the same for the same seed and time, and differs across seeds', () => {
  const field = (seed: number, t: number) => {
    const f = new Float32Array(100 * 60);
    const s = new Float32Array(100 * 60);
    weatherFields(100, 60, t, seed, f, s);
    return [f, s];
  };
  // Find a time with rain and re-ask for it.
  const t = Array.from({ length: 4000 }, (_, i) => i).find(
    (i) => rainEvent(i, 5) && rainEvent(i, 5)!.age > 20
  )!;
  assert.deepEqual(field(5, t), field(5, t));
  const schedule = (seed: number) =>
    Array.from({ length: 40 }, (_, n) => rainEvent(n * RAIN_SLOT + 30, seed) !== null);
  assert.notDeepEqual(schedule(1), schedule(2));
});

test('a rain cloud is bigger than any ordinary cloud, stays dim, and rains below itself', () => {
  const stormArea = Math.max(...STORMS.map((s) => s.mask.filter((v) => v > 0).length));
  const cloudArea = Math.max(
    ...CLOUD_SHAPES.map((s) => s.mask.filter((v) => v > 0).length)
  );
  assert.ok(stormArea > cloudArea);
  assert.ok(
    STORMS.every((s) => s.mask.every((v) => v === 0 || (v >= 0.3 && v <= 0.9))),
    'visible but dimmer than rim of day clouds'
  );
  for (const [cols, rows] of [
    [28, 60],
    [100, 90],
    [300, 140],
  ]) {
    for (const seed of SEEDS) {
      const t = Array.from({ length: 3000 }, (_, i) => i).find(
        (i) => (rainEvent(i, seed)?.age ?? 0) > 22
      )!;
      const f = new Float32Array(cols * rows);
      const s = new Float32Array(cols * rows);
      assert.equal(weatherFields(cols, rows, t, seed, f, s), true);
      assert.ok(s.every((v) => v >= 0 && v <= 1));
      assert.ok(f.every((v) => v >= 0 && v <= 1));
      const lit = s.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
      assert.ok(lit > 40, `${cols}x${rows}: ${lit} lit cells`);
      // The rain cloud hides ordinary clouds behind it.
      for (let i = 0; i < s.length; i++) if (s[i] > 0) assert.equal(f[i], 0);
    }
  }
});

test('rain is sparse and stays under the cloud', () => {
  const cols = 160;
  const rows = 100;
  const seed = 9;
  const t0 = Array.from({ length: 3000 }, (_, i) => i).find(
    (i) => (rainEvent(i, seed)?.age ?? 0) > 20
  )!;
  let maxRain = 0;
  for (let t = t0; t < t0 + 6; t += 1 / 24) {
    const f = new Float32Array(cols * rows);
    const s = new Float32Array(cols * rows);
    weatherFields(cols, rows, t, seed, f, s);
    // Rows of the cloud itself are those with a long solid run; rain rows have only a few lit cells.
    let rain = 0;
    for (let y = 0; y < rows; y++) {
      const n = s.subarray(y * cols, (y + 1) * cols).filter((v) => v > 0).length;
      if (n > 0 && n <= 16) rain += n;
    }
    maxRain = Math.max(maxRain, rain);
  }
  assert.ok(maxRain > 0, 'rain falls while the cloud is up');
  assert.ok(maxRain < 140, `rain stays sparse: ${maxRain} dots`);
});

test('the rain cloud fades in and out instead of popping, and rain stops before it leaves', () => {
  const cols = 160;
  const rows = 100;
  const seed = 11;
  const start = Array.from({ length: 3000 }, (_, i) => i).find(
    (i) => rainEvent(i, seed) && rainEvent(i, seed)!.age < 1
  )!;
  const light = (age: number) => {
    const f = new Float32Array(cols * rows);
    const s = new Float32Array(cols * rows);
    weatherFields(cols, rows, start + age, seed, f, s);
    return s.reduce((n, v) => n + v, 0);
  };
  assert.ok(light(0.5) < light(2.5) && light(2.5) < light(8));
  assert.ok(light(RAIN_LIFE - 0.5) < light(RAIN_LIFE - 5));
  // A short step in time changes the picture a little, never all at once.
  for (let a = 1; a < RAIN_LIFE - 1; a += 3.7) {
    assert.ok(
      Math.abs(light(a + 1 / 24) - light(a)) / (light(a) || 1) < 0.2,
      `jump at age ${a}`
    );
  }
});

test('a gust is a thin, bounded handful of dots that sweeps right and leaves nothing behind', () => {
  const seed = 4;
  for (const [cols, rows] of [
    [28, 60],
    [160, 100],
    [400, 140],
  ]) {
    const startT = Array.from({ length: 2000 }, (_, i) => i).find(
      (i) => (gustEvent(i, seed, cols)?.age ?? 9) < 0.5
    )!;
    const life = gustLife(cols);
    const center = (age: number) => {
      const f = new Float32Array(cols * rows);
      const s = new Float32Array(cols * rows);
      const base = new Float32Array(cols * rows);
      weatherFields(cols, rows, startT + age, seed, f, s);
      let n = 0;
      let m = 0;
      let lit = 0;
      for (let i = 0; i < f.length; i++) {
        if (f[i] > 0) {
          lit++;
          n += f[i];
          m += f[i] * (i % cols);
        }
        assert.ok(f[i] >= 0 && f[i] <= 1 && base[i] === 0);
      }
      return { c: m / (n || 1), lit };
    };
    const a = center(life * 0.3);
    const b = center(life * 0.6);
    assert.ok(a.lit > 0 && a.lit <= MAX_GUST_DOTS, `${cols}: ${a.lit} dots`);
    assert.ok(b.c > a.c, 'moves right');
    assert.equal(center(life + 0.5).lit, 0, 'gone once it has crossed');
  }
});

test('long sessions stay in range and the weather never fills the window', () => {
  const cols = 120;
  const rows = 80;
  const f = new Float32Array(cols * rows);
  const s = new Float32Array(cols * rows);
  let stormy = 0;
  for (const t of [0, 1.5, 3600, 86400, 7 * 86400 + 0.37, 1e7]) {
    cloudField(cols, rows, t, f);
    if (weatherFields(cols, rows, t, 42, f, s)) stormy++;
    assert.ok(f.every((v) => v >= 0 && v <= 1) && s.every((v) => v >= 0 && v <= 1));
    const lit = f.filter((v) => v > 0).length + s.filter((v) => v > 0).length;
    assert.ok(lit / (cols * rows) < 0.5, 'most of the window is still open sky');
  }
  assert.ok(stormy <= 3);
  // Weather needs no state: the buffers can be reused and negative time is simply calm.
  assert.equal(weatherFields(cols, rows, -5, 42, f, s), false);
});

test('a drag pulls the clouds along, stays bounded, and heals back to the plain field', () => {
  const cols = 60;
  const rows = 40;
  const plain = cloudField(cols, rows, 30);
  const s = createStir(cols * rows);
  for (let x = 10; x < 50; x += 2) stir(s, cols, rows, x, 10, 2, 0);
  stir(s, cols, rows, 30, 10, 500, -500); // a jump never pushes further than STIR_MAX
  assert.ok(s.dx.some((v) => v > 1), 'cells near the drag are pushed right');
  assert.ok(s.dx.every((v, i) => Math.hypot(v, s.dy[i]) <= STIR_MAX + 1e-4));
  assert.equal(s.dx[39 * cols], 0, 'cells far from the drag are untouched');
  const f = plain.slice();
  warpField(f, s, cols, rows);
  assert.notDeepEqual(f, plain);
  assert.ok(f.every((v) => v >= 0 && v <= 1));
  let left = true;
  let t = 0;
  for (; left && t < 60; t += 0.25) left = relaxStir(s, 0.25);
  assert.ok(!left && t < 20, `healed after ${t}s`);
  const healed = plain.slice();
  warpField(healed, s, cols, rows);
  assert.deepEqual(healed, plain);
});

test('a fast drag splits a solid cloud: a dim channel opens and the halves bulge apart', () => {
  const cols = 60;
  const rows = 40;
  const s = createStir(cols * rows);
  for (let x = 10; x < 40; x++) stir(s, cols, rows, x, 20, 6, 0);
  const f = new Float32Array(cols * rows).fill(1);
  warpField(f, s, cols, rows);
  const at = (c: number, r: number) => r * cols + c;
  assert.ok(f[at(30, 20)] < 0.3, 'the drag row is cleared');
  const out = STIR_RADIUS;
  assert.ok(f[at(30, 20 - out)] > 0.9 && f[at(30, 20 + out)] > 0.9, 'rows out of reach stay lit');
  assert.ok(s.dy[at(30, 18)] < 0, 'cells above are pushed up');
  assert.ok(s.dy[at(30, 22)] > 0, 'cells below are pushed down');
});

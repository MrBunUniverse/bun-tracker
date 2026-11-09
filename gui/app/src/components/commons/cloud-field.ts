// Pixel clouds for the welcome background (ContourDots). Each cloud is a hand-drawn bitmap where one
// character is one cell of the dot grid. Clouds ride in horizontal lanes, left to right, and the scene
// repeats along each lane, so it is the same at a given time on every run and never flickers.
// Sampling between two columns of a bitmap blends them, so a cloud slides across the fixed dots
// instead of jumping a whole cell at a time. Each cloud leaves a short dotted fade behind it.

export interface CloudShape {
  w: number;
  h: number;
  /** Brightness 0..1 per cell, row by row. */
  mask: Float32Array;
}

// Brightness of a cloud cell: the top edge catches the light, the underside is in shade.
const RIM = 1;
const BODY = 0.72;
const BELLY = 0.45;

// '#' is cloud, anything else is sky. Rows can be ragged; short rows are padded with sky.
export function parseCloud(
  rows: readonly string[],
  [rim, body, belly] = [RIM, BODY, BELLY]
): CloudShape {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const at = (x: number, y: number) => rows[y]?.[x] === '#';
  const mask = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue;
      mask[y * w + x] = !at(x, y - 1) ? rim : !at(x, y + 1) ? belly : body;
    }
  }
  return { w, h, mask };
}

// Drawn for the welcome grid's 8 px cells. Each one is stylized: stepped lobes on top, a flat underside.
// prettier-ignore
export const CLOUD_SHAPES: readonly CloudShape[] = [
  // Big cumulus: three stepped lobes on a wide flat base
  [
    '.............########.............',
    '............##########............',
    '...........############..####.....',
    '...........############.######....',
    '......####.####################...',
    '....############################..',
    '....############################..',
    '..###############################.',
    '..###############################.',
    '..###############################.',
    '...############################...',
  ],
  // Small puff: two lobes over a flat base
  [
    '........#####..',
    '...####.######.',
    '.#############.',
    '###############',
    '###############',
    '.#############.',
  ],
  // Long flat stratus: a low bank with two stepped bumps
  [
    '............................###########......',
    '............#########....################....',
    '....#######################################..',
    '.###########################################.',
    '#############################################',
    '.###########################################.',
  ],
  // Two humps: two domes with a notch between them
  [
    '......................#######.......',
    '......########......###########.....',
    '....############..###############...',
    '..##############..################..',
    '.##################################.',
    '.##################################.',
    '.##################################.',
  ],
  // Lobed cumulus: the tallest puff sits left of centre, a lower puff beside it, a broad ragged base
  [
    '....#####...........',
    '..#########.........',
    '.#####.#######......',
    '#######.########....',
    '##########.#######..',
    '####################',
    '###################.',
    '.################...',
    '..#############.....',
    '...###########......',
  ],
  // Thin wisp: a trailing streak with a tail on the right
  [
    '........######..............',
    '.....############...........',
    '..###################.......',
    '#########################...',
    '####################........',
  ],
].map((rows) => parseCloud(rows));

// A lane is one row band of sky. Its clouds sit one after another, each followed by a gap of open sky,
// and the whole run repeats along the lane. dy nudges a cloud down from the lane's top row.
interface Lane {
  speed: number; // cells per second
  clouds: readonly { shape: number; gap: number; dy: number }[];
}

// Cells per second, about 18-30 px/s on the 8 px grid: a cloud crosses a 1280 px window in under a
// minute and a new shape drifts in every few seconds, still slow enough to leave on while away.
// prettier-ignore
const LANES: readonly Lane[] = [
  { speed: 2.9, clouds: [{ shape: 0, gap: 39, dy: 0 }, { shape: 5, gap: 51, dy: 4 }] },
  { speed: 2.3, clouds: [{ shape: 2, gap: 45, dy: 3 }, { shape: 1, gap: 33, dy: 0 }] },
  { speed: 3.7, clouds: [{ shape: 3, gap: 57, dy: 2 }, { shape: 1, gap: 42, dy: 4 }] },
  { speed: 2.6, clouds: [{ shape: 4, gap: 36, dy: 0 }, { shape: 5, gap: 45, dy: 3 }, { shape: 2, gap: 54, dy: 2 }] },
];

/** Rows from one lane's top to the next. */
export const LANE_ROWS = 32;
const FIRST_ROW = 3;

// Lane i uses LANES[i % LANES.length]. Its run starts this many cells further on than the lane above,
// so repeated lanes do not line up into columns.
const LANE_SHIFT = 62;

/** Cells of dotted trail behind each cloud. */
export const TRAIL = 6;
// Brightness of the trail just behind a cloud, fading to nothing at the end of TRAIL.
const TRAIL_GAIN = 0.6;

export function laneLength(lane: number) {
  return LANES[lane % LANES.length].clouds.reduce(
    (n, c) => n + CLOUD_SHAPES[c.shape].w + c.gap,
    0
  );
}

export function laneSpeed(lane: number) {
  return LANES[lane % LANES.length].speed;
}

/** How busy the field is. The welcome page draws every lane at full speed; the dashboard draws fewer, slower ones. */
export interface CloudProfile {
  /** Only lanes 0, laneStep, 2 * laneStep, ... are drawn. */
  laneStep: number;
  /** Multiplies every lane's speed. */
  speed: number;
}
export const WELCOME_CLOUDS: CloudProfile = { laneStep: 1, speed: 1 };
export const CALM_CLOUDS: CloudProfile = { laneStep: 2, speed: 0.6 };

/**
 * Cloud brightness 0..1 for every cell of a cols x rows grid at `time` seconds, row by row.
 * Overlapping clouds take the brighter value. Pass `out` to reuse a buffer of cols * rows.
 * Pass `profile` to thin out or slow the field.
 */
export function cloudField(
  cols: number,
  rows: number,
  time: number,
  out?: Float32Array,
  profile: CloudProfile = WELCOME_CLOUDS
) {
  const field = out && out.length === cols * rows ? out : new Float32Array(cols * rows);
  field.fill(0);
  for (let lane = 0; FIRST_ROW + lane * LANE_ROWS < rows; lane++) {
    if (lane % profile.laneStep) continue;
    const { speed, clouds } = LANES[lane % LANES.length];
    const period = laneLength(lane);
    const top = FIRST_ROW + lane * LANE_ROWS;
    // Left edge of the run, wrapped into (-period, 0], so copies at +k * period cover the screen.
    const run = time * speed * profile.speed + lane * LANE_SHIFT;
    const start = (((run % period) + period) % period) - period;
    let offset = 0;
    for (const { shape, gap, dy } of clouds) {
      const s = CLOUD_SHAPES[shape];
      for (let left = start + offset; left < cols; left += period) {
        if (left + s.w > 0) stampCloud(field, cols, rows, s, left, top + dy);
      }
      offset += s.w + gap;
    }
  }
  return field;
}

/**
 * Adds a cloud with its left edge at fractional column `left` to the field. Behind it runs a dotted
 * trail: copies up to TRAIL cells further left, on every other grid cell and dimmer the further back.
 */
export function stampCloud(
  field: Float32Array,
  cols: number,
  rows: number,
  s: CloudShape,
  left: number,
  top: number
) {
  stamp(field, cols, rows, s, left, top, 1, false);
  for (let d = 1; d <= TRAIL; d++) {
    const gain = TRAIL_GAIN * (1 - d / (TRAIL + 1));
    stamp(field, cols, rows, s, left - d, top, gain, true);
  }
}

// Draws shape s with its left edge at fractional column `left`. Each cell blends the two bitmap
// columns it straddles, so brightness moves smoothly as `left` grows. `gain` scales the brightness, and
// `dotted` keeps only the cells on a checkerboard of the fixed grid.
function stamp(
  field: Float32Array,
  cols: number,
  rows: number,
  s: CloudShape,
  left: number,
  top: number,
  gain: number,
  dotted: boolean
) {
  const base = Math.floor(left);
  const f = left - base; // how far the bitmap has moved past column `base`
  for (let y = 0; y < s.h; y++) {
    const row = top + y;
    if (row < 0 || row >= rows) continue;
    for (let i = 0; i <= s.w; i++) {
      const col = base + i;
      if (col < 0 || col >= cols) continue;
      if (dotted && (col + row) % 2) continue;
      // Cell col shows bitmap column i - f: (1 - f) of column i and f of column i - 1.
      const a = i < s.w ? s.mask[y * s.w + i] : 0;
      const b = i > 0 ? s.mask[y * s.w + i - 1] : 0;
      const v = (a * (1 - f) + b * f) * gain;
      const k = row * cols + col;
      if (v > field[k]) field[k] = v;
    }
  }
}

// Rare weather for the welcome background (ContourDots), on top of the ordinary cloud field: a dark
// rain cloud that drops sparse dotted rain, and a thin gust of wind. Both are pure functions of the
// scene time and a seed, so they need no timers or particle lists: the same time and seed always give
// the same frame, nothing flickers, and nothing builds up over a long session.
// Time is cut into slots. Each slot hashes to "event or not" and a start inside the slot, and an event
// always ends before its slot does, so there is at most one rain cloud and one gust at any moment.

export const RAIN_SLOT = 180; // seconds
export const RAIN_CHANCE = 0.4; // about one rain cloud per 7.5 minutes, about 10% of the time
export const RAIN_LIFE = 44;
export const GUST_SLOT = 18;
export const GUST_CHANCE = 0.8; // about one gust every 22 seconds
export const GUST_SPEED = 22; // cells per second
export const GUST_TAIL = 24; // cells
export const MAX_GUST_DOTS = 3 * (GUST_TAIL + 2);

const STORM_DRIFT = 1.1; // cells per second
const RAIN_FALL = 13; // rows below the cloud that rain can reach
const MAX_DROPS = 18;
const GUST_STRANDS = 3;
// Brightness of a rain-cloud cell: lit rim, dimmer body, dim shaded belly.
const STORM_LEVELS: [number, number, number] = [0.85, 0.6, 0.42];

// prettier-ignore
export const STORMS: readonly CloudShape[] = [
  // Compact, for narrow windows
  [
    '.........#####..........',
    '.....#########..####....',
    '...###############.###..',
    '.######################.',
    '########################',
    '########################',
    '.######################.',
    '..####.#######.#####.##.',
    '....#.....##.......#....',
  ],
  // Large: a heavy bank with a ragged underside
  [
    '.................######.....................',
    '...............##########...######..........',
    '.............#############.###########......',
    '......#####.###########################.....',
    '....######################################..',
    '..##########################################',
    '.###########################################',
    '############################################',
    '############################################',
    '.##########################################.',
    '..#########.##########.#########.##########.',
    '...###...##....####.....###.....#####....##.',
    '.....#..........#..........#................',
  ],
].map((rows) => parseCloud(rows, STORM_LEVELS));

// The compact cloud is used below this many columns.
export const STORM_NARROW = 80;

// Head and trail brightness of one raindrop, like the Settings DotRain: a bright head, a fading tail.
const DROP = [1, 0.75, 0.55, 0.4, 0.28, 0.2];

/** Pseudo-random 0..1 from a seed and up to three integers. Same inputs, same number. */
export function rand(seed: number, a: number, b = 0, c = 0) {
  let h =
    (seed ^
      Math.imul(a + 1, 0x9e3779b1) ^
      Math.imul(b + 1, 0x85ebca6b) ^
      Math.imul(c + 1, 0xc2b2ae35)) >>>
    0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export interface WeatherEvent {
  slot: number;
  age: number; // seconds since it began
}

/** The event running at `time`, if any. `kind` keeps rain and gusts on separate random streams. */
export function eventAt(
  time: number,
  seed: number,
  kind: number,
  slotLength: number,
  chance: number,
  life: number
): WeatherEvent | null {
  if (time < 0) return null;
  const slot = Math.floor(time / slotLength);
  if (rand(seed, kind, slot, 0) >= chance) return null;
  const start =
    slot * slotLength + rand(seed, kind, slot, 1) * Math.max(0, slotLength - life);
  const age = time - start;
  return age >= 0 && age < life ? { slot, age } : null;
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export const rainEvent = (time: number, seed: number) =>
  eventAt(time, seed, 1, RAIN_SLOT, RAIN_CHANCE, RAIN_LIFE);

// A gust crosses the whole window, so its length depends on the width.
export const gustLife = (cols: number) =>
  Math.min(GUST_SLOT - 1, (cols + GUST_TAIL + 4) / GUST_SPEED);
export const gustEvent = (time: number, seed: number, cols: number) =>
  eventAt(time, seed, 2, GUST_SLOT, GUST_CHANCE, gustLife(cols));

/**
 * Fills `storm` (the rain cloud and its rain) and adds the gust to `field` (the ordinary clouds).
 * A rain cloud hides the ordinary clouds behind it. Returns whether the rain cloud is up.
 * Both buffers hold cols * rows cells; `storm` is cleared here.
 */
export function weatherFields(
  cols: number,
  rows: number,
  time: number,
  seed: number,
  field: Float32Array,
  storm: Float32Array
) {
  storm.fill(0);
  const rain = rainEvent(time, seed);
  if (rain) stormCloud(cols, rows, seed, rain, storm);
  if (rain) {
    for (let i = 0; i < storm.length; i++) if (storm[i] > 0) field[i] = 0;
  }
  const gust = gustEvent(time, seed, cols);
  if (gust) gustStreaks(cols, rows, seed, gust, field);
  return rain !== null;
}

function stormCloud(
  cols: number,
  rows: number,
  seed: number,
  { slot, age }: WeatherEvent,
  storm: Float32Array
) {
  const s = STORMS[cols >= STORM_NARROW ? 1 : 0];
  const r = (k: number) => rand(seed, 1000 + slot, k);
  const room = Math.max(0, cols - s.w);
  // It drifts right, but slowly enough to stay inside a narrow window for its whole life.
  const start = room * 0.5 * r(0);
  const drift = Math.min(STORM_DRIFT, (room - start) / RAIN_LIFE);
  const left = (a: number) => start + drift * a;
  // Upper two lanes, pulled up if the window is too short to leave room for the rain.
  const top = Math.max(0, Math.min(3 + Math.floor(r(1) * 2) * 16, rows - s.h - 6));
  stampCloud(storm, cols, rows, s, left(age), top);
  const fade = smooth(age / 5) * (1 - smooth((age - (RAIN_LIFE - 6)) / 6));
  for (let i = 0; i < storm.length; i++) storm[i] *= fade;

  const bottom = top + s.h;
  const fall = Math.min(RAIN_FALL, rows - bottom);
  const wet = smooth((age - 5) / 5) * (1 - smooth((age - (RAIN_LIFE - 13)) / 6));
  if (fall <= 0 || wet <= 0) return;
  const drops = Math.min(MAX_DROPS, Math.max(6, Math.round(s.w / 3.2)));
  for (let i = 0; i < drops; i++) {
    const d = (k: number) => rand(seed, 2000 + slot, i, k);
    const speed = 8 + 4 * d(0); // rows per second, near the Settings rain's 11
    const len = 4 + Math.floor(d(1) * 3);
    const cycle = (fall + len) / speed + 0.5 + 2.5 * d(2); // falls, then rests a moment
    const phase = d(3) * cycle;
    const n = Math.floor((age + phase) / cycle);
    const head = Math.floor((age + phase - n * cycle) * speed);
    if (head >= fall + len) continue;
    // The drop keeps the column it left the cloud in, even as the cloud drifts on.
    const col = Math.floor(
      left(Math.max(0, n * cycle - phase)) + ((i + d(4) * 0.8) / drops) * (s.w - 4) + 2
    );
    if (col < 0 || col >= cols) continue;
    for (let k = 0; k < len; k++) {
      const depth = head - k; // rows below the cloud
      if (depth < 0 || depth >= fall) continue;
      const v = DROP[Math.min(k, DROP.length - 1)] * (1 - depth / fall) ** 0.45 * wet;
      const cell = (bottom + depth) * cols + col;
      if (v > storm[cell]) storm[cell] = v;
    }
  }
}

// A few thin wavy strands, staggered a few cells apart, sweep left to right. Each strand's path is
// fixed on the grid; the gust only moves the bright head along it and the tail fades behind.
function gustStreaks(
  cols: number,
  rows: number,
  seed: number,
  { slot, age }: WeatherEvent,
  field: Float32Array
) {
  const r = (k: number) => rand(seed, 3000 + slot, k);
  const y0 = rows * (0.12 + 0.6 * r(0));
  for (let i = 0; i < GUST_STRANDS; i++) {
    const head = age * GUST_SPEED - 2 - i * (3 + 3 * r(1 + i));
    const baseY = y0 + i * (2 + 2 * r(4 + i));
    const amp = 1 + 1.1 * r(7 + i);
    const wave = 30 + 14 * r(10 + i);
    const phase = r(13 + i) * 6.28;
    for (
      let c = Math.max(0, Math.ceil(head - GUST_TAIL));
      c <= Math.min(cols - 1, Math.floor(head + 1));
      c++
    ) {
      const k = head - c; // cells behind the head; negative just ahead of it
      let v = k < 0 ? 1 + k : (1 - k / GUST_TAIL) ** 1.2;
      if (k > 2 && c % 2) v *= 0.5; // the tail thins out to dots on every other cell
      const y = Math.round(
        baseY + amp * Math.sin((c / wave) * 6.28 + phase) - k * 0.04
      );
      if (y < 0 || y >= rows) continue;
      const cell = y * cols + c;
      if (v > field[cell]) field[cell] = v;
    }
  }
}

// Stirring the welcome background with the cursor (ContourDots): dragging pulls the clouds along with
// it and thins them where it passes fast. A fast drag also splits them: cells beside the swipe are
// shoved sideways, away from it, and a thin channel along it is cleared. The push is a per-cell offset
// in grid cells, laid over whatever the field holds that frame, and it fades back to nothing, so the
// clouds re-form on their own.

export const STIR_RADIUS = 9; // cells around the cursor that feel a drag
export const STIR_MAX = 9; // furthest a cell can be pushed, in cells
export const STIR_HEAL = 2; // seconds for a push to fall to about a third
const STIR_THIN = 0.65; // most a fast drag can dim a cell
const STIR_SPLIT = 5; // sideways shove, in cells, a fast drag gives cells right beside its line
// Warping samples from p - d, so shoving cells outward only copies cloud from the line outward; the
// channel of this half-width, in cells, is dimmed hard so a visible gap opens between the halves.
const STIR_TEAR = 1.5;

export interface Stir {
  dx: Float32Array;
  dy: Float32Array;
  thin: Float32Array;
  /** Scratch buffer for warpField. */
  out: Float32Array;
}

export const createStir = (n: number): Stir => ({
  dx: new Float32Array(n),
  dy: new Float32Array(n),
  thin: new Float32Array(n),
  out: new Float32Array(n),
});

/** A drag of (vx, vy) cells that ended at cell (x, y). */
export function stir(
  s: Stir,
  cols: number,
  rows: number,
  x: number,
  y: number,
  vx: number,
  vy: number
) {
  const v = Math.hypot(vx, vy);
  if (v > STIR_MAX) {
    vx *= STIR_MAX / v;
    vy *= STIR_MAX / v;
  }
  const speed = Math.min(1, v / 4); // slow drags mostly bend, fast ones split
  const thin = STIR_THIN * speed;
  const nx = v > 0 ? -vy / v : 0; // unit normal to the drag line
  const ny = v > 0 ? vx / v : 0;
  for (let r = Math.ceil(y - STIR_RADIUS); r <= y + STIR_RADIUS; r++) {
    if (r < 0 || r >= rows) continue;
    for (let c = Math.ceil(x - STIR_RADIUS); c <= x + STIR_RADIUS; c++) {
      if (c < 0 || c >= cols) continue;
      const d = Math.hypot(c - x, r - y);
      if (d >= STIR_RADIUS) continue;
      const w = (1 - d / STIR_RADIUS) ** 2;
      const i = r * cols + c;
      const side = (c - x) * nx + (r - y) * ny; // signed distance from the drag line
      const away =
        (side < 0 ? -1 : 1) * STIR_SPLIT * speed * w * Math.exp(-Math.abs(side) / 3);
      const tear =
        Math.max(0, 1 - Math.abs(side) / STIR_TEAR) * speed * (1 - d / STIR_RADIUS);
      let dx = s.dx[i] + vx * w + nx * away;
      let dy = s.dy[i] + vy * w + ny * away;
      const m = Math.hypot(dx, dy);
      if (m > STIR_MAX) {
        dx *= STIR_MAX / m;
        dy *= STIR_MAX / m;
      }
      s.dx[i] = dx;
      s.dy[i] = dy;
      s.thin[i] = Math.min(1, Math.max(s.thin[i], thin * w, tear));
    }
  }
}

/** Lets the push fade for dt seconds. Returns whether any is left. */
export function relaxStir(s: Stir, dt: number) {
  const k = Math.exp(-dt / STIR_HEAL);
  let left = false;
  for (let i = 0; i < s.dx.length; i++) {
    s.dx[i] *= k;
    s.dy[i] *= k;
    s.thin[i] *= k;
    if (Math.abs(s.dx[i]) < 0.05 && Math.abs(s.dy[i]) < 0.05 && s.thin[i] < 0.01) {
      s.dx[i] = s.dy[i] = s.thin[i] = 0;
    } else left = true;
  }
  return left;
}

/** Moves each cell of f by its push (nearest cell, so dots stay on the grid) and dims it by its thinning. */
export function warpField(f: Float32Array, s: Stir, cols: number, rows: number) {
  const out = s.out;
  for (let i = 0; i < f.length; i++) {
    const c = Math.round((i % cols) - s.dx[i]);
    const r = Math.round(Math.floor(i / cols) - s.dy[i]);
    out[i] =
      c < 0 || c >= cols || r < 0 || r >= rows ? 0 : f[r * cols + c] * (1 - s.thin[i]);
  }
  f.set(out);
}

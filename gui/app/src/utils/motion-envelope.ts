// The tracker card's motion rim: a relative activity level (0-1) from the tracker's own rotation and
// acceleration feed. It is a display envelope, not a calibrated speed. Pure, so it is tested directly.

export type Quat = { x: number; y: number; z: number; w: number };
export type Vec3 = { x: number; y: number; z: number };

/** Rotation is measured across at least this span, so per-sample jitter does not grow with the feed rate. */
const ROT_WINDOW_MS = 100;
/** A feed gap this long counts as stale: the glow fades, and the next sample starts a fresh measurement. */
export const STALE_MS = 400;
// Calibration knobs. Rotation in rad/s: up to ~14°/s is MPU-class IMU drift and jitter, ~230°/s a fast swing.
const ROT_DEAD = 0.25;
const ROT_FULL = 4;
// Acceleration in m/s² away from the tracker's own recent baseline, so a gravity-removal bias stays dark.
const ACC_DEAD = 2;
const ACC_FULL = 12;
const ACC_BASELINE_MS = 1000;
// Below 1 lifts small movement, so a slight genuine turn still shows a faint rim.
const CURVE = 0.55;
// Envelope time constants: a quick rise, a gentler fall.
const RISE_MS = 70;
const FALL_MS = 450;
// The moving state switches with hysteresis, so a level near the line cannot flicker.
const MOVING_ON = 0.2;
const MOVING_OFF = 0.1;

export type MotionMeter = {
  hasAnchor: boolean;
  ax: number;
  ay: number;
  az: number;
  aw: number;
  anchorAt: number;
  lastAt: number;
  rot: number;
  hasBase: boolean;
  bx: number;
  by: number;
  bz: number;
  acc: number;
};

export const createMotionMeter = (): MotionMeter => ({
  hasAnchor: false,
  ax: 0,
  ay: 0,
  az: 0,
  aw: 1,
  anchorAt: 0,
  lastAt: Number.NEGATIVE_INFINITY,
  rot: 0,
  hasBase: false,
  bx: 0,
  by: 0,
  bz: 0,
  acc: 0,
});

const ramp = (value: number, dead: number, full: number) =>
  value <= dead ? 0 : Math.min(1, (value - dead) / (full - dead)) ** CURVE;

const finiteQuat = (q?: Quat | null): q is Quat =>
  !!q &&
  Number.isFinite(q.x) &&
  Number.isFinite(q.y) &&
  Number.isFinite(q.z) &&
  Number.isFinite(q.w);

const finiteVec = (v?: Vec3 | null): v is Vec3 =>
  !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/** Angle in radians between two orientations; q and -q count as the same rotation. */
export function rotationAngle(a: Quat, b: Quat) {
  const norms = Math.hypot(a.x, a.y, a.z, a.w) * Math.hypot(b.x, b.y, b.z, b.w);
  if (!norms) return 0;
  const dot = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w) / norms;
  return 2 * Math.acos(Math.min(1, dot));
}

/** Feeds one sample at `now` (ms) and returns the activity target, 0-1. Values are copied, never kept. */
export function meterSample(
  m: MotionMeter,
  now: number,
  rot?: Quat | null,
  acc?: Vec3 | null
) {
  const dt = now - m.lastAt;
  if (!(dt >= 0) || dt > STALE_MS) {
    m.hasAnchor = false;
    m.hasBase = false;
    m.rot = 0;
    m.acc = 0;
  }
  m.lastAt = now;

  if (!finiteQuat(rot)) {
    m.hasAnchor = false;
    m.rot = 0;
  } else if (!m.hasAnchor || now - m.anchorAt >= ROT_WINDOW_MS) {
    if (m.hasAnchor) {
      const seconds = (now - m.anchorAt) / 1000;
      m.rot = ramp(
        rotationAngle({ x: m.ax, y: m.ay, z: m.az, w: m.aw }, rot) / seconds,
        ROT_DEAD,
        ROT_FULL
      );
    }
    m.hasAnchor = true;
    m.ax = rot.x;
    m.ay = rot.y;
    m.az = rot.z;
    m.aw = rot.w;
    m.anchorAt = now;
  }

  // Headsets and controllers often send no acceleration; rotation alone then drives the level.
  if (!finiteVec(acc)) {
    m.hasBase = false;
    m.acc = 0;
  } else if (!m.hasBase) {
    m.hasBase = true;
    m.bx = acc.x;
    m.by = acc.y;
    m.bz = acc.z;
    m.acc = 0;
  } else {
    m.acc = ramp(
      Math.hypot(acc.x - m.bx, acc.y - m.by, acc.z - m.bz),
      ACC_DEAD,
      ACC_FULL
    );
    const k = 1 - Math.exp(-dt / ACC_BASELINE_MS);
    m.bx += (acc.x - m.bx) * k;
    m.by += (acc.y - m.by) * k;
    m.bz += (acc.z - m.bz) * k;
  }

  return Math.max(m.rot, m.acc);
}

/** True while the meter's last sample is recent enough to trust. */
export const meterFresh = (m: MotionMeter, now: number) => now - m.lastAt <= STALE_MS;

/** Moves `level` toward `target` over `dtMs`; exponential, so the result does not depend on the tick rate. */
export function stepEnvelope(level: number, target: number, dtMs: number) {
  const goal = Math.min(1, Math.max(0, target || 0));
  if (!(dtMs > 0)) return level;
  const next =
    goal + (level - goal) * Math.exp(-dtMs / (goal > level ? RISE_MS : FALL_MS));
  return goal === 0 && next < 0.002 ? 0 : next;
}

/**
 * One glow step from the last frame at `at` to `now`. `ticking` means something calls this every frame (the
 * card's own ticker or the shared demo scheduler). Without one, a dark card restarts its clock, so an idle
 * gap is not read as one long step and the next rise still eases in.
 */
export const glowStep = (
  level: number,
  target: number,
  at: number,
  now: number,
  ticking: boolean
) => stepEnvelope(level, target, !ticking && level === 0 ? 0 : now - at);

export const isMovingLevel = (level: number, wasMoving: boolean) =>
  level > (wasMoving ? MOVING_OFF : MOVING_ON);

/** With animations off or reduced motion: a few still steps instead of a continuously changing rim. */
export const staticLevel = (level: number) =>
  level < 0.04 ? 0 : level < 0.35 ? 0.2 : level < 0.7 ? 0.55 : 0.9;

// Demo episodes cycle faint, moderate and strong peaks, offset per tracker, so the grid shows the whole range.
// Only one in eight is a full-strength gesture, so a strong rim reads as an event, not the baseline.
const DEMO_PEAKS = [0.2, 0.5, 0.32, 0.95, 0.42, 0.72, 0.26, 0.6];
export const demoPeak = (trackerId: number, episode: number) =>
  DEMO_PEAKS[
    (((trackerId + episode) % DEMO_PEAKS.length) + DEMO_PEAKS.length) %
      DEMO_PEAKS.length
  ];

/** Time between a demo card's motion episodes: a gesture of ~1.4-1.7 s, then a short rest of ~0.3-0.6 s. */
export const DEMO_EPISODE_MS = 2000;
/** A card's first episode starts this late in the slot; the spread keeps cards out of step. */
export const demoEpisodeOffset = (trackerId: number) =>
  (trackerId * 700) % DEMO_EPISODE_MS;

// Gesture shapes, one per episode: [ms into the episode, turn (-1..1 of the card's full turn), weight shift 0|1].
// A quick stop-start turn with short holds, a double tap, then a slow lean that settles. Turn ramps keep
// about their previous duration; holds and the trailing rest are what shrank. Each ends at rest before
// the slot ends, so consecutive episodes join without a jump.
const DEMO_SHAPES: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
  [
    [0, 0, 0],
    [230, 0.75, 0],
    [380, 0.75, 0],
    [600, 1, 1],
    [850, 1, 1],
    [1200, -0.25, 0],
    [1450, 0.1, 0],
    [1550, 0, 0],
  ],
  [
    [0, 0, 0],
    [200, -0.6, 0],
    [400, -0.6, 0],
    [580, 0, 0],
    [920, -0.6, 0],
    [1120, -0.6, 0],
    [1420, 0, 0],
  ],
  [
    [0, 0, 0],
    [400, 0.4, 0],
    [750, 0.9, 1],
    [1000, 0.9, 1],
    [1400, 0.3, 0],
    [1650, 0, 0],
  ],
];
const smooth = (x: number) => x * x * (3 - 2 * x);

function demoShape(shape: (typeof DEMO_SHAPES)[number], ms: number) {
  for (let i = 1; i < shape.length; i++) {
    const [t1, r1, s1] = shape[i];
    if (ms >= t1) continue;
    const [t0, r0, s0] = shape[i - 1];
    const k = smooth(Math.max(0, (ms - t0) / (t1 - t0)));
    return { rot: r0 + (r1 - r0) * k, shift: s0 + (s1 - s0) * k };
  }
  return { rot: 0, shift: 0 };
}

export interface DemoScene {
  /** Icon turn as a fraction of the card's full turn, -1..1 (already scaled by the episode strength). */
  rot: number;
  /** Weight shift 0..1. */
  shift: number;
  /** Rim/shade target 0..1: follows how fast the pose is changing, so holds go quiet. */
  activity: number;
}

/**
 * One deterministic demo scene for a tracker at scene time `t` (ms, any shared clock): the icon pose and
 * the rim/shade activity come from the same timeline, so they cannot drift apart. A card's pose holds still
 * between moves and its activity falls to 0; a stronger episode peak turns further and lights brighter.
 * `reach` (0-1) caps how strong a tracker's gestures get: a headset stays subtle, a controller uses it all.
 */
export function sampleDemoScene(trackerId: number, t: number, reach = 1): DemoScene {
  const local = t - demoEpisodeOffset(trackerId);
  const episode = Math.floor(local / DEMO_EPISODE_MS);
  const shape = DEMO_SHAPES[(((episode + trackerId) % 3) + 3) % 3];
  const at = (ms: number) => demoShape(shape, ms);
  const ms = local - episode * DEMO_EPISODE_MS;
  const now = at(ms);
  const peak = demoPeak(trackerId, episode) * reach;
  const amp = 0.35 + 0.65 * peak;
  const before = at(ms - 40);
  // Shape units per second over the last 40 ms: the light follows a move, never leads it.
  const speed =
    (Math.abs(now.rot - before.rot) + 0.5 * Math.abs(now.shift - before.shift)) / 0.04;
  return {
    rot: now.rot * amp,
    shift: now.shift,
    // Full light only on the fastest ramps of a strong episode; a moderate move still reaches most of its peak.
    activity: peak * Math.min(1, speed / 3),
  };
}

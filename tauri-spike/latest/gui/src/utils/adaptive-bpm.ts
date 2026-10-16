export interface ActivityRotation {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface ActivityTracker {
  id: string;
  role: 'torso' | 'thigh' | 'other';
  rotation: ActivityRotation;
  postureRotation?: ActivityRotation | null;
}

export type ActivityPosture = 'Standing' | 'Sitting' | 'Lying down' | 'Unknown posture';

function normalized(q: ActivityRotation): ActivityRotation | null {
  const length = Math.hypot(q.x, q.y, q.z, q.w);
  if (!Number.isFinite(length) || length < 0.001) return null;
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

export class AdaptiveBpmModel {
  private previous = new Map<string, ActivityRotation>();
  private lastSample = -Infinity;
  private lastValid = -Infinity;
  private fast = 0;
  private slow = 0;
  private bpm = 74;
  private posture: ActivityPosture = 'Unknown posture';
  private candidate: ActivityPosture = 'Unknown posture';
  private candidateSince = 0;

  sample(trackers: ActivityTracker[], now: number) {
    const elapsed = (now - this.lastSample) / 1000;
    if (elapsed < 0.05) return;
    const dt = Math.min(elapsed, 0.5);
    const continuous = elapsed <= 1;
    this.lastSample = now;
    const next = new Map<string, ActivityRotation>();
    const speeds: number[] = [];
    const torso: number[] = [];
    const thighs: number[] = [];
    for (const tracker of trackers) {
      const q = normalized(tracker.rotation);
      if (!q) continue;
      next.set(tracker.id, q);
      const previous = continuous ? this.previous.get(tracker.id) : undefined;
      if (previous) {
        // q and -q describe the same orientation. Raw rotations avoid reset jumps.
        const dot = Math.abs(
          q.x * previous.x + q.y * previous.y + q.z * previous.z + q.w * previous.w
        );
        speeds.push(Math.min(6, (2 * Math.acos(Math.min(1, dot))) / dt));
      }
      const calibrated = tracker.postureRotation && normalized(tracker.postureRotation);
      if (calibrated) {
        const vertical = Math.abs(1 - 2 * (calibrated.x ** 2 + calibrated.z ** 2));
        if (tracker.role === 'torso') torso.push(vertical);
        if (tracker.role === 'thigh') thighs.push(vertical);
      }
    }
    this.previous = next;
    if (!next.size) {
      this.lastValid = -Infinity;
      this.posture = this.candidate = 'Unknown posture';
      this.fast = this.slow = 0;
      return;
    }
    this.lastValid = now;
    if (!continuous) {
      this.fast = this.slow = 0;
      this.posture = this.candidate = 'Unknown posture';
      this.candidateSince = now;
    }
    const mean = (values: number[]) =>
      values.reduce((a, b) => a + b, 0) / values.length;
    const torsoVertical = mean(torso);
    const thighVertical = mean(thighs);
    const candidate: ActivityPosture =
      torso.length && thighs.length
        ? torsoVertical < 0.45 && thighVertical < 0.55
          ? 'Lying down'
          : torsoVertical > 0.7 && thighVertical < 0.55
            ? 'Sitting'
            : torsoVertical > 0.7 && thighVertical > 0.75
              ? 'Standing'
              : 'Unknown posture'
        : 'Unknown posture';
    if (candidate !== this.candidate) {
      this.candidate = candidate;
      this.candidateSince = now;
    }
    if (candidate === 'Unknown posture' || now - this.candidateSince >= 2500)
      this.posture = candidate;
    // Average body motion limits the influence of a single waving hand.
    const intensity = speeds.length
      ? Math.max(0, Math.min(1, (mean(speeds) - 0.08) / 2.5))
      : 0;
    this.fast += (intensity - this.fast) * (1 - Math.exp(-dt / 2));
    this.slow += (intensity - this.slow) * (1 - Math.exp(-dt / 12));
    const predicted = Math.min(
      1,
      this.fast + Math.max(0, this.fast - this.slow) * 0.35
    );
    const base =
      this.posture === 'Lying down'
        ? 60
        : this.posture === 'Sitting'
          ? 72
          : this.posture === 'Standing'
            ? 84
            : 74;
    const target = base + (160 - base) * predicted;
    this.bpm +=
      (target - this.bpm) * (1 - Math.exp(-dt / (target > this.bpm ? 8 : 30)));
  }

  snapshot(now: number) {
    const available = now - this.lastValid < 2000;
    return {
      available,
      bpm: Math.round(this.bpm),
      intensity: available ? Math.round(this.fast * 100) : 0,
      posture: available ? this.posture : ('Unknown posture' as ActivityPosture),
      activity: !available
        ? 'Waiting for trackers'
        : this.fast > 0.6
          ? 'Fast movement'
          : this.fast > 0.18
            ? 'Moving'
            : this.posture,
    };
  }
}

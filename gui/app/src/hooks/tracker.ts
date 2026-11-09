import { RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { BodyPart, TrackerDataT, TrackerInfoT, TrackerStatus } from 'solarxr-protocol';
import { QuaternionFromQuatT, QuaternionToEulerDegrees } from '@/maths/quaternion';
import { ReactLocalization, useLocalization } from '@fluent/react';
import { useDataFeedConfig } from './datafeed-config';
import { Quaternion, Vector3 } from 'three';
import { Vector3FromVec3fT } from '@/maths/vector3';
import { useAtomValue } from 'jotai';
import { trackerFromIdAtom } from '@/store/app-store';
import { useConfig } from './config';
import {
  createMotionMeter,
  isMovingLevel,
  meterFresh,
  meterSample,
  sampleDemoScene,
  staticLevel,
  glowStep,
} from '@/utils/motion-envelope';

// Protocol names are typed string | Uint8Array; the byte form is UTF-8 text.
const nameText = (value: string | Uint8Array | null | undefined) =>
  value instanceof Uint8Array ? new TextDecoder().decode(value) : value;

export function getTrackerName(l10n: ReactLocalization, info: TrackerInfoT | null) {
  const custom = nameText(info?.customName);
  if (custom) return custom;
  if (info?.bodyPart) return l10n.getString('body_part-' + BodyPart[info?.bodyPart]);
  return nameText(info?.displayName) || 'NONE';
}

// Motion level above which a tracker counts as moving.
const MOVING = 0.18;

// Reports a 0-1 motion level for each new rotation sample: the summed rotation and acceleration
// change over the last half second, for smooth detection of slow movement.
function useMotionLevel(
  tracker: TrackerDataT,
  feedMaxTps: number,
  report: (level: number) => void
) {
  const previousRot = useRef<Quaternion>(QuaternionFromQuatT(tracker.rotation));
  const previousAcc = useRef<Vector3>(Vector3FromVec3fT(tracker.linearAcceleration));
  const deltas = useRef<number[]>([]);

  useEffect(() => {
    if (!tracker.rotation) return;
    const rot = QuaternionFromQuatT(tracker.rotation).multiply(
      previousRot.current.clone().invert()
    );
    const acc = Vector3FromVec3fT(tracker.linearAcceleration).sub(previousAcc.current);
    const dif = Math.min(
      1,
      (rot.x ** 2 + rot.y ** 2 + rot.z ** 2) * 50 +
        (acc.x ** 2 + acc.y ** 2 + acc.z ** 2) / 1000
    );
    if (deltas.current.length >= 0.5 * feedMaxTps) {
      deltas.current.shift();
    }
    deltas.current.push(dif);
    report(
      Math.min(
        1,
        Math.max(
          0,
          deltas.current.reduce((a, b) => a + b)
        )
      )
    );

    previousRot.current = QuaternionFromQuatT(tracker.rotation);
    previousAcc.current = Vector3FromVec3fT(tracker.linearAcceleration);
  }, [tracker.rotation]);
}

export function useTracker(tracker: TrackerDataT) {
  const { l10n } = useLocalization();
  const { feedMaxTps } = useDataFeedConfig();

  return {
    useName: () =>
      useMemo(() => getTrackerName(l10n, tracker.info), [tracker.info, l10n]),
    useRawRotationEulerDegrees: () =>
      useMemo(() => QuaternionToEulerDegrees(tracker?.rotation), [tracker.rotation]),
    useRefAdjRotationEulerDegrees: () =>
      useMemo(
        () =>
          tracker?.rotationReferenceAdjusted &&
          QuaternionToEulerDegrees(tracker?.rotationReferenceAdjusted),
        [tracker.rotationReferenceAdjusted]
      ),
    useIdentAdjRotationEulerDegrees: () =>
      useMemo(
        () =>
          tracker?.rotationIdentityAdjusted &&
          QuaternionToEulerDegrees(tracker?.rotationIdentityAdjusted),
        [tracker.rotationIdentityAdjusted]
      ),
    useVelocity: () => {
      const [velocity, setVelocity] = useState<number>(0);
      const shownRef = useRef(0);
      const lastUpdateRef = useRef<number>(0);
      useMotionLevel(tracker, feedMaxTps, (newV) => {
        const shown = shownRef.current;
        const now = performance.now();
        const thresholdCrossed =
          (newV > MOVING && shown <= MOVING) || (newV <= MOVING && shown > MOVING);
        if (thresholdCrossed || now - lastUpdateRef.current > 33) {
          lastUpdateRef.current = now;
          shownRef.current = newV;
          setVelocity(newV);
        }
      });
      return velocity;
    },
    // Same motion measure as useVelocity, but it only re-renders when the tracker starts or stops moving.
    useIsMoving: () => {
      const [moving, setMoving] = useState(false);
      useMotionLevel(tracker, feedMaxTps, (newV) => setMoving(newV > MOVING));
      return moving;
    },
  };
}

const GLOW_TICK_MS = 33;

// One bounded ticker for every demo card: all of them sample the same performance.now() scene clock, so
// pose, shade and rim cannot drift apart across mount, hide/resume or status changes. It runs only while
// a card is subscribed and the page is visible.
const demoSubs = new Set<(t: number) => void>();
let demoTimer = 0;
function syncDemoTimer() {
  const run = demoSubs.size > 0 && !document.hidden;
  if (run && !demoTimer) {
    demoTimer = window.setInterval(() => {
      const t = performance.now();
      demoSubs.forEach((f) => f(t));
    }, GLOW_TICK_MS);
  } else if (!run && demoTimer) {
    clearInterval(demoTimer);
    demoTimer = 0;
  }
}
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', syncDemoTimer);
function subscribeDemoScene(f: (t: number) => void) {
  demoSubs.add(f);
  syncDemoTimer();
  f(performance.now());
  return () => {
    demoSubs.delete(f);
    syncDemoTimer();
  };
}

/** What a demo card's icon does; the scene itself comes from `sampleDemoScene`. */
export interface DemoDrive {
  id: number;
  /** Degrees at full turn, and px at full weight shift, signed by direction. */
  deg: number;
  px: number;
  /** 0-1 cap on gesture strength (see `sampleDemoScene`). */
  reach: number;
  icon: RefObject<HTMLElement | null>;
}
const reducedMotionQuery =
  typeof window !== 'undefined'
    ? window.matchMedia?.('(prefers-reduced-motion: reduce)')
    : undefined;

type Glow = ReturnType<typeof newGlow>;
const newGlow = () => ({
  meter: createMotionMeter(),
  measured: 0,
  driven: false,
  demo: 0,
  live: false,
  still: false,
  level: 0,
  shown: -1,
  at: 0,
  timer: 0,
  moving: false,
  el: null as HTMLElement | null,
  setMoving: (_moving: boolean) => {},
});

// One envelope step: writes --motion-level on the card and keeps a ticker only while the rim is lit.
function glowFrame(g: Glow) {
  const now = performance.now();
  const measured = g.live && meterFresh(g.meter, now) ? g.measured : 0;
  const target = g.live ? Math.max(measured, g.demo) : 0;
  g.level = glowStep(g.level, target, g.at, now, !!g.timer || g.driven);
  g.at = now;

  const out = g.still || reducedMotionQuery?.matches ? staticLevel(g.level) : g.level;
  if (g.el && (Math.abs(out - g.shown) >= 0.004 || (out === 0 && g.shown !== 0))) {
    g.el.style.setProperty('--motion-level', out.toFixed(3));
    g.shown = out;
  }
  const moving = isMovingLevel(g.level, g.moving);
  if (moving !== g.moving) {
    g.moving = moving;
    g.setMoving(moving);
  }

  const active = target > 0 || g.level > 0;
  // A demo scene's shared scheduler already ticks this card, so it needs no ticker of its own.
  if (active && !g.timer && !g.driven) {
    g.timer = window.setInterval(() => glowFrame(g), GLOW_TICK_MS);
  } else if ((!active || g.driven) && g.timer) {
    clearInterval(g.timer);
    g.timer = 0;
  }
}

/**
 * Drives a tracker card's motion rim from the tracker's own feed: sets `--motion-level` (0-1) on `card`
 * without re-rendering, and returns whether the tracker counts as moving (changes only on crossings).
 * `demo` (demo cards only) runs the shared demo scene: it sets `--demo-rot` and `--demo-shift` on the icon
 * and feeds the same scene's activity into the rim. Offline or stale trackers fade to dark.
 */
export function useMotionGlow(
  tracker: TrackerDataT,
  card: RefObject<HTMLElement | null>,
  demo: DemoDrive | null = null
) {
  const { config } = useConfig();
  const [moving, setMoving] = useState(false);
  const ref = useRef<Glow | null>(null);
  const g = (ref.current ??= newGlow());
  g.live = tracker.status !== TrackerStatus.DISCONNECTED;
  g.still = config?.animations === false;
  g.setMoving = setMoving;

  useEffect(() => {
    g.el = card.current;
    g.shown = -1;
    glowFrame(g);
    return () => {
      clearInterval(g.timer);
      g.timer = 0;
    };
  }, []);

  useEffect(() => {
    if (!g.live || !tracker.rotation) return;
    g.measured = meterSample(
      g.meter,
      performance.now(),
      tracker.rotation,
      tracker.linearAcceleration
    );
    glowFrame(g);
  }, [tracker.rotation]);

  useEffect(() => glowFrame(g), [g.live, g.still]);

  const demoId = demo?.id;
  const demoDeg = demo?.deg ?? 0;
  const demoPx = demo?.px ?? 0;
  const demoReach = demo?.reach ?? 1;
  useEffect(() => {
    const icon = demo?.icon;
    if (demoId === undefined || !icon || !g.live || g.still) return;
    g.driven = true;
    const unsubscribe = subscribeDemoScene((t) => {
      const scene = reducedMotionQuery?.matches
        ? { rot: 0, shift: 0, activity: 0 }
        : sampleDemoScene(demoId, t, demoReach);
      icon.current?.style.setProperty(
        '--demo-rot',
        `${(scene.rot * demoDeg).toFixed(2)}deg`
      );
      icon.current?.style.setProperty(
        '--demo-shift',
        `${(scene.shift * demoPx).toFixed(2)}px`
      );
      g.demo = scene.activity;
      glowFrame(g);
    });
    return () => {
      unsubscribe();
      g.driven = false;
      g.demo = 0;
      glowFrame(g);
    };
  }, [demoId, demoDeg, demoPx, demoReach, g.live, g.still]);

  return moving;
}

export function useTrackerFromId(
  trackerNum: string | number | undefined,
  deviceId: string | number | undefined
) {
  const trackerAtom = useMemo(
    () => trackerFromIdAtom({ trackerNum, deviceId }),
    [trackerNum, deviceId]
  );
  return useAtomValue(trackerAtom);
}

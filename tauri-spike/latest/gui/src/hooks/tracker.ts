import { useEffect, useMemo, useRef, useState } from 'react';
import { BodyPart, TrackerDataT, TrackerInfoT } from 'solarxr-protocol';
import { QuaternionFromQuatT, QuaternionToEulerDegrees } from '@/maths/quaternion';
import { ReactLocalization, useLocalization } from '@fluent/react';
import { useDataFeedConfig } from './datafeed-config';
import { Quaternion, Vector3 } from 'three';
import { Vector3FromVec3fT } from '@/maths/vector3';
import { useAtomValue } from 'jotai';
import { trackerFromIdAtom } from '@/store/app-store';

export function getTrackerName(l10n: ReactLocalization, info: TrackerInfoT | null) {
  if (info?.customName) return info?.customName;
  if (info?.bodyPart) return l10n.getString('body_part-' + BodyPart[info?.bodyPart]);
  return info?.displayName || 'NONE';
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

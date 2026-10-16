import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BodyPart,
  DataFeedMessage,
  DataFeedUpdateT,
  TrackerStatus,
} from 'solarxr-protocol';
import { AdaptiveBpmModel, ActivityTracker } from '@/utils/adaptive-bpm';
import { useWebsocketAPI } from './websocket-api';

export function useAdaptiveBpm(active: boolean) {
  const { useDataFeedPacket, isConnected } = useWebsocketAPI();
  const model = useRef(new AdaptiveBpmModel());
  const [state, setState] = useState(() => model.current.snapshot(performance.now()));

  useEffect(() => {
    model.current = new AdaptiveBpmModel();
    setState(model.current.snapshot(performance.now()));
  }, [active, isConnected]);

  const receive = useCallback(
    (packet: DataFeedUpdateT) => {
      if (!active || !isConnected || !packet.devices.length) return;
      const trackers: ActivityTracker[] = [];
      for (const device of packet.devices) {
        for (const tracker of device.trackers) {
          if (
            !tracker.info?.isImu ||
            tracker.status !== TrackerStatus.OK ||
            !tracker.rotation ||
            tracker.tps === 0
          )
            continue;
          const part = tracker.info.bodyPart;
          trackers.push({
            id: `${tracker.trackerId?.deviceId?.id}:${tracker.trackerId?.trackerNum}`,
            role: [
              BodyPart.CHEST,
              BodyPart.UPPER_CHEST,
              BodyPart.WAIST,
              BodyPart.HIP,
            ].includes(part)
              ? 'torso'
              : [BodyPart.LEFT_UPPER_LEG, BodyPart.RIGHT_UPPER_LEG].includes(part)
                ? 'thigh'
                : 'other',
            rotation: tracker.rotation,
            postureRotation: tracker.rotationReferenceAdjusted,
          });
        }
      }
      model.current.sample(trackers, performance.now());
    },
    [active, isConnected]
  );
  useDataFeedPacket(DataFeedMessage.DataFeedUpdate, receive);

  useEffect(() => {
    if (!active || !isConnected) return;
    const timer = setInterval(
      () => setState(model.current.snapshot(performance.now())),
      500
    );
    return () => clearInterval(timer);
  }, [active, isConnected]);

  return { ...state, available: active && isConnected && state.available };
}

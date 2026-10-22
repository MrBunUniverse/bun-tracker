import { useMemo } from 'react';
import { DataFeedConfigT, DeviceDataMaskT, TrackerDataMaskT } from 'solarxr-protocol';
import { useConfig } from './config';

// `detail` (a screen that shows them is open) or debug mode also asks for the fields that only the
// tracker settings, stay-aligned and table "more info" views read.
export function useDataFeedConfig(livePreview = false, detail = false) {
  const { config } = useConfig();

  const fastDataFeed = config?.debug && config?.devSettings?.fastDataFeed;
  const feedMaxTps = fastDataFeed ? 90 : livePreview ? 30 : 10;
  const fullMask = detail || !!config?.debug;

  return useMemo(() => {
    const trackerData = new TrackerDataMaskT();
    trackerData.position = true;
    trackerData.rotation = true;
    trackerData.info = true;
    trackerData.status = true;
    trackerData.temp = true;
    trackerData.linearAcceleration = true;
    trackerData.rotationReferenceAdjusted = true;
    trackerData.rotationIdentityAdjusted = true;
    trackerData.tps = true;
    trackerData.recovery = true;
    trackerData.rawMagneticVector = fullMask;
    trackerData.stayAligned = fullMask;
    trackerData.adaptiveDrift = fullMask;
    trackerData.filterHealth = fullMask;

    const dataMask = new DeviceDataMaskT();
    dataMask.deviceData = true;
    dataMask.trackerData = trackerData;

    const dataFeedConfig = new DataFeedConfigT();
    dataFeedConfig.dataMask = dataMask;
    dataFeedConfig.boneMask = false;
    dataFeedConfig.minimumTimeSinceLast = 1000 / feedMaxTps;
    dataFeedConfig.syntheticTrackersMask = trackerData;
    dataFeedConfig.stayAlignedPoseMask = fullMask;
    dataFeedConfig.serverGuardsMask = true;

    return { dataFeedConfig, feedMaxTps };
  }, [feedMaxTps, fullMask]);
}

export function useBonesDataFeedConfig() {
  const { config } = useConfig();

  const fastDataFeed = config?.debug && config?.devSettings?.fastDataFeed;
  const feedMaxTps = fastDataFeed ? 90 : 40;

  return useMemo(() => {
    const dataFeedConfig = new DataFeedConfigT();
    dataFeedConfig.boneMask = true;
    dataFeedConfig.minimumTimeSinceLast = 1000 / feedMaxTps;
    return dataFeedConfig;
  }, [feedMaxTps]);
}

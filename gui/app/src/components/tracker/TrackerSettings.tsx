import { useLocalization } from '@fluent/react';
import classNames from 'classnames';
import { IPv4 } from 'ip-num';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import {
  AdaptiveDriftAction,
  AdaptiveDriftFreezeReason,
  AdaptiveDriftControlRequestT,
  AdaptiveDriftMode,
  AssignTrackerRequestT,
  BoardType,
  BodyPart,
  ClearDriftCompensationRequestT,
  ForgetDeviceRequestT,
  ImuType,
  MagnetometerStatus,
  RpcMessage,
  DeviceDataT,
  TrackerDataT,
  TrackerDataType,
  TrackerStatus as TrackerStatusEnum,
} from 'solarxr-protocol';
import { useDebouncedEffect } from '@/hooks/timeout';
import { useTracker, useTrackerFromId } from '@/hooks/tracker';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import {
  MountingOrientationDegreesToQuatT,
  QuaternionFromQuatT,
  rotationToQuatMap,
  similarQuaternions,
} from '@/maths/quaternion';
import { ArrowLink } from '@/components/commons/ArrowLink';
import { BodyPartIcon } from '@/components/commons/BodyPartIcon';
import { Button } from '@/components/commons/Button';
import { Dropdown, DropdownItem } from '@/components/commons/Dropdown';
import { WarningIcon } from '@/components/commons/icon/WarningIcon';
import { Input } from '@/components/commons/Input';
import { Typography } from '@/components/commons/Typography';
import { MountingSelectionMenu } from '@/components/onboarding/pages/mounting/MountingSelectionMenu';
import { IMUVisualizerWidget } from '@/components/widgets/IMUVisualizerWidget';
import { SingleTrackerBodyAssignmentMenu } from './SingleTrackerBodyAssignmentMenu';
import { TrackerStatus } from './TrackerStatus';
import { BatteryBar, SignalBars } from '@/components/home/HomeEmptyState';
import { Quaternion } from 'three';
import { useAppContext } from '@/hooks/app';
import { MagnetometerToggleSetting } from '@/components/settings/pages/MagnetometerToggleSetting';
import { useSetAtom } from 'jotai';
import { ignoredTrackersAtom, trackerDetailCountAtom } from '@/store/app-store';
import { useFeedDemand } from '@/hooks/feed-demand';
import { checkForUpdate } from '@/hooks/firmware-update';
import { Tooltip } from '@/components/commons/Tooltip';

const IMU_PROFILE_ITEMS: DropdownItem[] = [
  { value: 'auto', label: 'Auto-Detect' },
  { value: 'mpu6050', label: 'MPU6050 (Extreme Drift)' },
  { value: 'bmi160', label: 'BMI160 (High Drift)' },
  { value: 'lsm6_icm', label: 'LSM6 / ICM (Medium Drift)' },
  { value: 'bno085', label: 'BNO085 (Zero Drift)' },
];

const rotationsLabels: [Quaternion, string][] = [
  [rotationToQuatMap.BACK, 'tracker-rotation-back'],
  [rotationToQuatMap.FRONT, 'tracker-rotation-front'],
  [rotationToQuatMap.LEFT, 'tracker-rotation-left'],
  [rotationToQuatMap.RIGHT, 'tracker-rotation-right'],
  [rotationToQuatMap.BACK_LEFT, 'tracker-rotation-back_left'],
  [rotationToQuatMap.BACK_RIGHT, 'tracker-rotation-back_right'],
  [rotationToQuatMap.FRONT_LEFT, 'tracker-rotation-front_left'],
  [rotationToQuatMap.FRONT_RIGHT, 'tracker-rotation-front_right'],
];

const PANEL =
  'relative flex flex-col gap-3 p-5 sm:p-6 rounded-[24px] bg-background-70/70 dark:bg-background-10/[0.02] border border-background-50/50 dark:border-background-10/[0.08] shadow-xl';

function Panel({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={classNames(PANEL, className)}>
      <div className="flex flex-col gap-1">
        <Typography variant="section-title">{title}</Typography>
        {description && (
          <Typography color="secondary">{description}</Typography>
        )}
      </div>
      {children}
    </section>
  );
}

// One label/value line: muted label left, value right, same height everywhere.
function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 min-h-9 border-b border-background-10/[0.06] last:border-b-0">
      <Typography color="secondary" whitespace="whitespace-nowrap">
        {label}
      </Typography>
      <Typography
        textAlign="text-end"
        whitespace="whitespace-pre-wrap"
        className="break-all tnum"
      >
        {value}
      </Typography>
    </div>
  );
}

function HeroStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-[104px]">
      <Typography color="secondary" whitespace="whitespace-nowrap">
        {label}
      </Typography>
      <div className="flex items-center min-h-5">{children}</div>
    </div>
  );
}

function TrackerHero({
  tracker,
  device,
}: {
  tracker: TrackerDataT;
  device?: DeviceDataT;
}) {
  const { l10n } = useLocalization();
  const { useName } = useTracker(tracker);
  // Status is shown by the pill, so a name carrying "(Offline)" would say it twice.
  const name = useName().replace(/\s*\(Offline\)/gi, '');
  const offline = tracker.status === TrackerStatusEnum.DISCONNECTED;
  const hw = device?.hardwareStatus;
  const ping = hw?.ping;
  const voltage = hw?.batteryVoltage;
  const showLoss = hw?.packetsReceived != null;

  return (
    <section
      className={classNames(
        PANEL,
        'sm:flex-row sm:items-center sm:justify-between gap-6'
      )}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div
          className={classNames(
            'flex shrink-0 items-center justify-center w-16 h-16 rounded-[18px] bg-background-80 border border-background-10/[0.08] fill-background-10 text-background-10',
            offline && 'opacity-60'
          )}
        >
          <BodyPartIcon bodyPart={tracker.info?.bodyPart} width={40} />
        </div>
        <div className="flex flex-col gap-2 min-w-0 items-start">
          <Typography variant="main-title" truncate className="max-w-full">
            {name}
          </Typography>
          <TrackerStatus
            status={tracker.status}
            recovery={tracker.recovery}
            bodyPart={tracker.info?.bodyPart}
          />
        </div>
      </div>
      <div
        className={classNames(
          'flex flex-wrap gap-x-8 gap-y-3',
          offline && 'opacity-60'
        )}
      >
        <HeroStat label={l10n.getString('tracker-stat-battery')}>
          <BatteryBar
            pct={offline ? null : hw?.batteryPctEstimate}
            voltage={voltage ? `${voltage.toFixed(2)} V` : null}
          />
          {!offline && voltage != null && voltage > 0 && (
            <Typography color="secondary" className="ml-2 tnum">
              {voltage.toFixed(2)} V
            </Typography>
          )}
        </HeroStat>
        <HeroStat label={l10n.getString('tracker-stat-signal')}>
          <SignalBars rssi={offline ? null : hw?.rssi} />
          <Typography className="ml-2 tnum">
            {!offline && ping != null && ping > 0 ? `${ping} ms` : '—'}
          </Typography>
        </HeroStat>
        {showLoss && (
          <HeroStat label={l10n.getString('tracker-infos-packet_loss')}>
            <Typography className="tnum">
              {offline ? '—' : `${((hw?.packetLoss ?? 0) * 100).toFixed(0)}%`}
            </Typography>
          </HeroStat>
        )}
      </div>
    </section>
  );
}

export function TrackerSettingsPage() {
  const { l10n } = useLocalization();
  // Drift, filter health, magnetometer and stay-aligned readouts.
  useFeedDemand(trackerDetailCountAtom);

  const { sendRPCPacket } = useWebsocketAPI();
  const [selectRotation, setSelectRotation] = useState<boolean>(false);
  const [selectBodypart, setSelectBodypart] = useState<boolean>(false);
  const { trackernum, deviceid } = useParams<{
    trackernum: string;
    deviceid: string;
  }>();
  const tracker = useTrackerFromId(trackernum, deviceid);
  const [driftCorrectionEnabled, setDriftCorrectionEnabled] = useState(
    tracker?.tracker.info?.allowDriftCompensation ?? false
  );
  const { control, watch, reset, handleSubmit } = useForm<{
    trackerName: string | null;
    imuProfileOverride: string;
  }>({
    defaultValues: {
      trackerName: null,
      imuProfileOverride: 'auto',
    },
    reValidateMode: 'onSubmit',
  });
  const setIgnoredTracker = useSetAtom(ignoredTrackersAtom);
  const { trackerName, imuProfileOverride } = watch();

  useEffect(() => {
    setDriftCorrectionEnabled(
      tracker?.tracker.info?.allowDriftCompensation ?? false
    );
  }, [
    tracker?.tracker.trackerId?.deviceId?.id,
    tracker?.tracker.trackerId?.trackerNum,
    tracker?.tracker.info?.allowDriftCompensation,
  ]);

  const onDirectionSelected = (mountingOrientationDegrees: Quaternion) => {
    if (!tracker) return;

    const assignreq = new AssignTrackerRequestT();

    assignreq.mountingOrientation = MountingOrientationDegreesToQuatT(
      mountingOrientationDegrees
    );
    assignreq.bodyPosition = tracker?.tracker.info?.bodyPart || BodyPart.NONE;
    assignreq.trackerId = tracker?.tracker.trackerId;
    assignreq.allowDriftCompensation = driftCorrectionEnabled;
    assignreq.imuProfileOverride = imuProfileOverride;
    sendRPCPacket(RpcMessage.AssignTrackerRequest, assignreq);
    setSelectRotation(false);
  };

  const onRoleSelected = (role: BodyPart) => {
    if (!tracker) return;

    const assignreq = new AssignTrackerRequestT();
    assignreq.bodyPosition = role;
    assignreq.trackerId = tracker?.tracker.trackerId;
    assignreq.allowDriftCompensation = driftCorrectionEnabled;
    assignreq.imuProfileOverride = imuProfileOverride;
    sendRPCPacket(RpcMessage.AssignTrackerRequest, assignreq);
    setSelectBodypart(false);
  };

  const currRotation = useMemo(() => {
    return QuaternionFromQuatT(tracker?.tracker.info?.mountingOrientation);
  }, [tracker?.tracker.info?.mountingOrientation]);

  // Mounting is left out: it only changes through onDirectionSelected, and
  // re-sending it would clear automatic mounting on the server.
  const updateTrackerSettings = () => {
    if (!tracker) return;
    const assignreq = new AssignTrackerRequestT();
    assignreq.bodyPosition = tracker?.tracker.info?.bodyPart || BodyPart.NONE;

    assignreq.displayName = trackerName ?? null;
    assignreq.trackerId = tracker?.tracker.trackerId;
    assignreq.allowDriftCompensation = driftCorrectionEnabled;
    assignreq.imuProfileOverride = imuProfileOverride;
    sendRPCPacket(RpcMessage.AssignTrackerRequest, assignreq);
  };

  const onSettingsSubmit = () => {
    updateTrackerSettings();
  };

  useDebouncedEffect(
    () => {
      const info = tracker?.tracker.info;
      if (!info) return;
      const serverProfile =
        typeof info.imuProfileOverride === 'string'
          ? info.imuProfileOverride
          : 'auto';
      // Only save real edits, not the initial load or a server echo.
      const changed =
        (trackerName ?? null) !==
          ((info.customName as string | null) ?? null) ||
        imuProfileOverride !== serverProfile ||
        driftCorrectionEnabled !== (info.allowDriftCompensation ?? false);
      if (changed) updateTrackerSettings();
    },
    [trackerName, imuProfileOverride, driftCorrectionEnabled],
    500
  );

  const handleResetLearnedDrift = () => {
    sendRPCPacket(
      RpcMessage.ClearDriftCompensationRequest,
      new ClearDriftCompensationRequestT(tracker?.tracker.trackerId)
    );
  };

  const sendAdaptiveDriftAction = (action: AdaptiveDriftAction) => {
    sendRPCPacket(
      RpcMessage.AdaptiveDriftControlRequest,
      new AdaptiveDriftControlRequestT(
        tracker?.tracker.trackerId ?? null,
        action
      )
    );
  };

  const adaptiveState = tracker?.tracker.adaptiveDrift;
  const filterHealth = tracker?.tracker.filterHealth;
  const adaptiveMode = adaptiveState
    ? AdaptiveDriftMode[adaptiveState.mode]
    : '--';
  const adaptivePaused =
    adaptiveState?.mode === AdaptiveDriftMode.DISABLED &&
    adaptiveState.freezeReason === AdaptiveDriftFreezeReason.PAUSED;
  const adaptiveCorrectionEnabled = driftCorrectionEnabled;
  const adaptiveLearningOn = tracker?.tracker.info?.autoLearnDrift === true;
  // Without measured observations the rate is only the IMU profile preset.
  const driftRateMeasured =
    (tracker?.tracker.info?.totalDriftObservations ?? 0) > 0;

  const learnedDriftDisplay = useMemo(() => {
    const learnedRate = tracker?.tracker.info?.learnedDriftRateDegPerMin;
    return learnedRate === undefined
      ? '--'
      : `±${Math.abs(learnedRate).toFixed(2)}°/min`;
  }, [tracker?.tracker.info?.learnedDriftRateDegPerMin]);

  useEffect(() => {
    const serverProfile = tracker?.tracker.info?.imuProfileOverride;
    reset({
      trackerName: tracker?.tracker.info?.customName as string | null,
      imuProfileOverride:
        typeof serverProfile === 'string' ? serverProfile : 'auto',
    });
  }, [
    tracker?.tracker.info?.customName,
    tracker?.tracker.info?.imuProfileOverride,
    reset,
  ]);

  const boardType = useMemo(() => {
    if (tracker?.device?.hardwareInfo?.officialBoardType) {
      return l10n.getString(
        'board_type-' +
          BoardType[
            tracker?.device?.hardwareInfo?.officialBoardType ??
              BoardType.UNKNOWN
          ]
      );
    } else if (tracker?.device?.hardwareInfo?.boardType) {
      return tracker?.device?.hardwareInfo?.boardType;
    } else {
      return '--';
    }
  }, [
    tracker?.device?.hardwareInfo?.officialBoardType,
    tracker?.device?.hardwareInfo?.boardType,
    l10n,
  ]);

  const macAddress = useMemo(() => {
    if (
      /(?:[a-zA-Z\d]{2}:){5}[a-zA-Z\d]{2}/.test(
        (tracker?.device?.hardwareInfo?.hardwareIdentifier as string | null) ??
          ''
      )
    ) {
      return tracker?.device?.hardwareInfo?.hardwareIdentifier as string;
    }
    return null;
  }, [tracker?.device?.hardwareInfo?.hardwareIdentifier]);

  const { currentFirmwareRelease } = useAppContext();

  const needUpdate =
    currentFirmwareRelease &&
    tracker?.device?.hardwareInfo &&
    checkForUpdate(currentFirmwareRelease, tracker?.device);
  const updateUnavailable = needUpdate === null;

  const hw = tracker?.device?.hardwareInfo;
  const hs = tracker?.device?.hardwareStatus;
  const info = tracker?.tracker.info;

  return (
    <form
      className="h-full overflow-y-auto animate-tracker-settings-in select-none [&_input]:select-text"
      onSubmit={handleSubmit(onSettingsSubmit)}
    >
      <SingleTrackerBodyAssignmentMenu
        isOpen={selectBodypart}
        onClose={() => setSelectBodypart(false)}
        onRoleSelected={onRoleSelected}
      />
      <MountingSelectionMenu
        bodyPart={info?.bodyPart}
        currRotation={currRotation}
        isOpen={selectRotation}
        onClose={() => setSelectRotation(false)}
        onDirectionSelected={onDirectionSelected}
      />
      <div className="flex flex-col gap-4 w-full max-w-[1100px] mx-auto px-6 smol:px-12 py-6 sm:py-8">
        <ArrowLink to="/">{l10n.getString('tracker-settings-back')}</ArrowLink>
        {tracker && (
          <TrackerHero tracker={tracker.tracker} device={tracker.device} />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <div className="flex flex-col gap-4 min-w-0">
            {tracker?.tracker && (
              <IMUVisualizerWidget tracker={tracker.tracker} />
            )}
            <Panel
              title={l10n.getString('tracker-settings-assignment_section')}
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Typography color="secondary">
                    {l10n.getString(
                      'tracker-settings-assignment_section-description'
                    )}
                  </Typography>
                  <div className="flex items-center justify-between gap-3 bg-background-80 w-full p-3 rounded-[16px]">
                    <div className="flex gap-3 items-center fill-background-10 min-w-0">
                      {info?.bodyPart !== BodyPart.NONE && (
                        <BodyPartIcon bodyPart={info?.bodyPart} />
                      )}
                      {info?.bodyPart === BodyPart.NONE && (
                        <WarningIcon className="fill-status-warning" />
                      )}
                      <Typography
                        color={classNames({
                          'text-status-warning':
                            info?.bodyPart === BodyPart.NONE,
                        })}
                      >
                        {l10n.getString(
                          'body_part-' +
                            BodyPart[info?.bodyPart || BodyPart.NONE]
                        )}
                      </Typography>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => setSelectBodypart(true)}
                    >
                      {l10n.getString(
                        'tracker-settings-assignment_section-edit'
                      )}
                    </Button>
                  </div>
                </div>
                {info?.isImu && (
                  <div className="flex flex-col gap-2">
                    <Typography variant="section-title">
                      {l10n.getString('tracker-settings-mounting_section')}
                    </Typography>
                    <Typography color="secondary">
                      {l10n.getString(
                        'tracker-settings-mounting_section-description'
                      )}
                    </Typography>
                    <div className="flex items-center justify-between gap-3 bg-background-80 w-full p-3 rounded-[16px]">
                      <div className="flex gap-3 items-center fill-background-10 min-w-0">
                        <BodyPartIcon bodyPart={BodyPart.NONE} />
                        <Typography>
                          {l10n.getString(
                            (rotationsLabels.find((q) =>
                              similarQuaternions(q[0], currRotation)
                            ) || [])[1] || 'tracker-rotation-custom'
                          ) +
                            (info?.mountingResetOrientation &&
                            !similarQuaternions(
                              QuaternionFromQuatT(
                                info.mountingResetOrientation
                              ),
                              new Quaternion()
                            )
                              ? ` ${l10n.getString('tracker-rotation-overriden')}`
                              : '')}
                        </Typography>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => setSelectRotation(true)}
                      >
                        {l10n.getString(
                          'tracker-settings-mounting_section-edit'
                        )}
                      </Button>
                    </div>
                  </div>
                )}
                {info?.isImu &&
                  info.magnetometer !== MagnetometerStatus.NOT_SUPPORTED && (
                    <MagnetometerToggleSetting
                      settingType="tracker"
                      trackerNum={tracker?.tracker.trackerId?.trackerNum}
                      deviceId={tracker?.tracker.trackerId?.deviceId?.id}
                    />
                  )}
              </div>
            </Panel>
            <Panel
              title={l10n.getString('tracker-settings-name_section')}
              description={l10n.getString(
                'tracker-settings-name_section-description'
              )}
              className="sentry-mask"
            >
              <Input
                placeholder={l10n.getString(
                  'tracker-settings-name_section-placeholder'
                )}
                type="text"
                name="trackerName"
                control={control}
                autocomplete="off"
                rules={undefined}
                label={l10n.getString('tracker-settings-name_section-label')}
              />
            </Panel>
          </div>
          <div className="flex flex-col gap-4 min-w-0">
            {hw?.hardwareIdentifier != 'Unknown' && (
              <Panel title={l10n.getString('tracker-settings-update-title')}>
                <div className="flex flex-col">
                  <InfoRow
                    label={l10n.getString('tracker-settings-build-date')}
                    value={hw?.firmwareDate || '--'}
                  />
                  <InfoRow
                    label={l10n.getString('tracker-settings-current-version')}
                    value={
                      hw?.firmwareVersion ? `v${hw.firmwareVersion}` : '--'
                    }
                  />
                  {!!hw?.officialBoardType && (
                    <InfoRow
                      label={l10n.getString('tracker-settings-latest-version')}
                      value={
                        updateUnavailable
                          ? l10n.getString(
                              'tracker-settings-update-unavailable-v2'
                            )
                          : (currentFirmwareRelease?.name ?? '--')
                      }
                    />
                  )}
                </div>
                {!updateUnavailable && (
                  <Tooltip
                    preferedDirection="top"
                    disabled={
                      needUpdate === 'can-update' || needUpdate === 'updated'
                    }
                    content={
                      <>
                        {needUpdate === 'unavailable' && (
                          <Typography id="tracker-settings-update-incompatible" />
                        )}
                        {needUpdate === 'blocked' && (
                          // This happens only if no update is available and or the user is not in the current stagged
                          <Typography id="tracker-settings-update-blocked" />
                        )}
                        {needUpdate === 'low-battery' &&
                          currentFirmwareRelease && (
                            <Typography id="tracker-settings-update-low-battery" />
                          )}
                      </>
                    }
                  >
                    <Button
                      variant={
                        needUpdate === 'can-update' ? 'primary' : 'secondary'
                      }
                      disabled={needUpdate !== 'can-update'}
                      to="/firmware-update"
                      id={
                        needUpdate === 'updated'
                          ? 'tracker-settings-update-up_to_date'
                          : 'tracker-settings-update'
                      }
                    />
                  </Tooltip>
                )}
              </Panel>
            )}
            <Panel title={l10n.getString('tracker-infos-manufacturer')}>
              <div className="flex flex-col">
                {hw?.manufacturer && (
                  <InfoRow
                    label={l10n.getString('tracker-infos-manufacturer')}
                    value={hw.manufacturer}
                  />
                )}
                <InfoRow
                  label={l10n.getString('tracker-infos-display_name')}
                  value={info?.displayName}
                />
                <InfoRow
                  label={l10n.getString('tracker-infos-custom_name')}
                  value={
                    <span className="sentry-mask">
                      {info?.customName || '--'}
                    </span>
                  }
                />
                <InfoRow
                  label={l10n.getString('tracker-infos-url')}
                  value={
                    hw?.ipAddress?.addr
                      ? `udp://${IPv4.fromNumber(hw.ipAddress.addr || 0).toString()}`
                      : '--'
                  }
                />
                <InfoRow
                  label={l10n.getString('tracker-infos-hardware_identifier')}
                  value={hw?.hardwareIdentifier || '--'}
                />
                <InfoRow
                  label={l10n.getString('tracker-infos-data_support')}
                  value={
                    info?.dataSupport ? TrackerDataType[info.dataSupport] : '--'
                  }
                />
                <InfoRow
                  label={l10n.getString('tracker-infos-imu')}
                  value={info?.imuType ? ImuType[info.imuType] : '--'}
                />
                <InfoRow
                  label={l10n.getString('tracker-infos-board_type')}
                  value={boardType}
                />
                <InfoRow
                  label={l10n.getString('tracker-infos-magnetometer')}
                  value={
                    info?.magnetometer === undefined
                      ? '--'
                      : l10n.getString('tracker-infos-magnetometer-status-v1', {
                          status: MagnetometerStatus[info.magnetometer],
                        })
                  }
                />
                <InfoRow
                  label={l10n.getString('tracker-infos-network_version')}
                  value={hw?.networkProtocolVersion || '--'}
                />
              </div>
            </Panel>
            {hs?.packetsReceived !== null && (
              <Panel title={l10n.getString('tracker-stat-connection')}>
                <div className="flex flex-col">
                  <InfoRow
                    label={l10n.getString('tracker-infos-packet_loss')}
                    value={`${((hs?.packetLoss ?? 0) * 100).toFixed(0)}%`}
                  />
                  <InfoRow
                    label={l10n.getString('tracker-infos-packets_lost')}
                    value={hs?.packetsLost ?? '0'}
                  />
                  <InfoRow
                    label={l10n.getString('tracker-infos-packets_received')}
                    value={hs?.packetsReceived ?? '0'}
                  />
                </div>
              </Panel>
            )}
            <div className={PANEL}>
              {tracker?.tracker.info?.isImu && (
                <details className="w-full group">
                  <summary className="cursor-pointer select-none list-none flex items-center justify-between rounded-lg bg-background-80 px-4 py-3">
                    <Typography variant="section-title">
                      Experimental
                    </Typography>
                    <span className="text-xs text-background-30">
                      Drift auto-learning is switched off
                    </span>
                  </summary>
                  <div className="flex flex-col gap-3 w-full mt-2 bg-background-80 p-4 rounded-lg">
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-center">
                        <Typography variant="section-title">
                          Adaptive Profile & Drift Memory
                        </Typography>
                        <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full bg-accent-background-20/20 border border-accent-background-20/40 text-background-10 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-background-30 shrink-0" />
                          Off
                        </span>
                      </div>
                      <Typography color="secondary">
                        {adaptiveLearningOn
                          ? 'Learns persistent drift rates per IMU across sessions and applies startup baseline compensation.'
                          : 'Adaptive learning is off: nothing is learned or applied from this memory.'}
                      </Typography>
                    </div>

                    <div className="grid md:grid-cols-2 gap-3 pt-1">
                      <div className="flex flex-col gap-1 bg-background-70 p-3 rounded-lg">
                        <Typography color="secondary">Detected IMU</Typography>
                        <Typography bold>
                          {tracker?.tracker.info?.imuType !== undefined
                            ? ImuType[tracker.tracker.info.imuType]
                            : '--'}
                        </Typography>
                      </div>
                      <div className="flex flex-col gap-1 bg-background-70 p-3 rounded-lg">
                        <Typography color="secondary">
                          {driftRateMeasured
                            ? 'Measured Drift Rate'
                            : 'Preset Drift Rate'}
                        </Typography>
                        <Typography bold className="text-accent-background-10">
                          {learnedDriftDisplay}
                        </Typography>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-4 gap-3 pt-1">
                      <div className="flex flex-col gap-1 bg-background-70 p-3 rounded-lg">
                        <Typography color="secondary">Learner State</Typography>
                        <Typography bold>{adaptiveMode}</Typography>
                      </div>
                      <div className="flex flex-col gap-1 bg-background-70 p-3 rounded-lg">
                        <Typography color="secondary">Confidence</Typography>
                        <Typography bold>
                          {adaptiveState
                            ? `${Math.round(adaptiveState.confidence * 100)}%`
                            : '--'}
                        </Typography>
                      </div>
                      <div className="flex flex-col gap-1 bg-background-70 p-3 rounded-lg">
                        <Typography color="secondary">Input</Typography>
                        <Typography bold>
                          {filterHealth
                            ? `${filterHealth.inputRateHz.toFixed(1)} Hz`
                            : '--'}
                        </Typography>
                      </div>
                      <div className="flex flex-col gap-1 bg-background-70 p-3 rounded-lg">
                        <Typography color="secondary">Jitter</Typography>
                        <Typography bold>
                          {filterHealth
                            ? `${filterHealth.packetJitterMs.toFixed(1)} ms`
                            : '--'}
                        </Typography>
                      </div>
                      <div className="flex flex-col gap-1 bg-background-70 p-3 rounded-lg">
                        <Typography color="secondary">Stable Window</Typography>
                        <Typography bold>
                          {adaptiveState
                            ? `${Math.round(Number(adaptiveState.stableDurationMs) / 1000)} s`
                            : '--'}
                        </Typography>
                      </div>
                      <div className="flex flex-col gap-1 bg-background-70 p-3 rounded-lg">
                        <Typography color="secondary">
                          Applied Correction (incl. global)
                        </Typography>
                        <Typography bold>
                          {adaptiveState
                            ? `${adaptiveState.appliedCorrectionDeg.toFixed(2)}°`
                            : '--'}
                        </Typography>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 pt-1">
                      <Typography bold>Profile Override</Typography>
                      <Dropdown
                        display="block"
                        control={control}
                        name="imuProfileOverride"
                        placeholder="Select Profile"
                        items={IMU_PROFILE_ITEMS}
                      />
                    </div>

                    <div className="flex flex-wrap justify-end gap-2 pt-1">
                      <Button
                        variant="secondary"
                        className="self-start text-xs !py-1.5"
                        onClick={() => {
                          const enabled = !adaptiveCorrectionEnabled;
                          setDriftCorrectionEnabled(enabled);
                          sendAdaptiveDriftAction(
                            enabled
                              ? AdaptiveDriftAction.ENABLE_CORRECTION
                              : AdaptiveDriftAction.DISABLE_CORRECTION
                          );
                        }}
                      >
                        {adaptiveCorrectionEnabled
                          ? 'Disable Correction'
                          : 'Enable Correction'}
                      </Button>
                      <Button
                        variant="secondary"
                        className="self-start text-xs !py-1.5"
                        onClick={() =>
                          sendAdaptiveDriftAction(
                            adaptivePaused
                              ? AdaptiveDriftAction.RESUME_LEARNING
                              : AdaptiveDriftAction.PAUSE_LEARNING
                          )
                        }
                      >
                        {adaptivePaused ? 'Resume Learning' : 'Pause Learning'}
                      </Button>
                      <Button
                        variant="secondary"
                        className="self-start text-xs !py-1.5"
                        onClick={() =>
                          sendAdaptiveDriftAction(
                            AdaptiveDriftAction.RESTORE_PREVIOUS_MODEL
                          )
                        }
                      >
                        Restore Previous
                      </Button>
                      <Button
                        variant="secondary"
                        className="self-start text-xs !py-1.5"
                        onClick={handleResetLearnedDrift}
                      >
                        Reset Learned Drift
                      </Button>
                    </div>
                  </div>
                </details>
              )}
            </div>
            {macAddress && (
              <Panel
                title={l10n.getString('tracker-settings-forget')}
                description={l10n.getString(
                  'tracker-settings-forget-description'
                )}
              >
                <Button
                  variant="secondary"
                  className="!bg-status-critical self-start"
                  onClick={() => {
                    sendRPCPacket(
                      RpcMessage.ForgetDeviceRequest,
                      new ForgetDeviceRequestT(macAddress)
                    );
                    setIgnoredTracker((state) => {
                      state.add(macAddress);
                      return state;
                    });
                  }}
                >
                  {l10n.getString('tracker-settings-forget-label')}
                </Button>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

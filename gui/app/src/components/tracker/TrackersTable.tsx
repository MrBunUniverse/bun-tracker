import classNames from 'classnames';
import './TrackersTable.scss';
import { IPv4 } from 'ip-num';
import { CSSProperties, ReactNode, useMemo, useRef } from 'react';
import { useConfig } from '@/hooks/config';
import { useElemSize } from '@/hooks/layout';
import { fitColumns } from '@/utils/table-columns';
import { useMotionGlow, useTracker } from '@/hooks/tracker';
import { BodyPartIcon } from '@/components/commons/BodyPartIcon';
import { Typography } from '@/components/commons/Typography';
import { formatVector3 } from '@/utils/formatting';
import { TrackerStatus } from './TrackerStatus';
import {
  BatteryBar,
  SignalPing,
  trackerProblems,
} from '@/components/home/HomeEmptyState';
import { batteryRedness } from '@/utils/battery-cells';
import { FlatDeviceTracker, trackerDetailCountAtom } from '@/store/app-store';
import { useFeedDemand } from '@/hooks/feed-demand';
import { StayAlignedInfo } from '@/components/stay-aligned/StayAlignedInfo';
import { Tooltip } from '@/components/commons/Tooltip';
import { WarningIcon } from '@/components/commons/icon/WarningIcon';
import { FirmwareIcon } from '@/components/commons/FirmwareIcon';
import {
  BodyPart,
  TrackerDataT,
  TrackerStatus as TrackerStatusEnum,
  TrackingChecklistStepT,
} from 'solarxr-protocol';
import {
  highlightedTrackers,
  trackingchecklistIdtoLabel,
  useTrackingChecklist,
} from '@/hooks/tracking-checklist';

const isHMD = ({ tracker }: FlatDeviceTracker) =>
  tracker.info?.isHmd || tracker.info?.bodyPart === BodyPart.HEAD;

const isSlime = ({ device }: FlatDeviceTracker) =>
  device?.hardwareInfo?.manufacturer === 'SlimeVR' ||
  device?.hardwareInfo?.manufacturer === 'HID Device';

const getTrackerName = ({ tracker }: FlatDeviceTracker) =>
  tracker?.info?.customName?.toString() || '';

export function TrackerNameCell({
  tracker,
  warning,
  moving,
  problems = [],
}: {
  tracker: TrackerDataT;
  warning: TrackingChecklistStepT | boolean;
  moving?: boolean;
  problems?: { label: string; tone: string }[];
}) {
  const { useName } = useTracker(tracker);

  const name = useName();

  return (
    <div className="tracker-list-name flex items-center gap-3 min-w-0">
      <div className="flex shrink-0 justify-center items-center relative">
        {warning && (
          <div className="absolute -left-2 -top-1 text-status-warning ">
            <WarningIcon width={16} />
          </div>
        )}
        <span
          className={classNames(
            'tracker-accent tracker-list-icon flex items-center justify-center rounded-[6px] border-[2px]',
            warning ? 'border-status-warning' : 'border-transparent',
            moving
              ? 'tracker-moving text-motion fill-motion'
              : 'text-background-20 fill-background-20'
          )}
        >
          <BodyPartIcon bodyPart={tracker.info?.bodyPart} width={24} />
        </span>
      </div>
      <div className="flex flex-col flex-grow min-w-0 gap-0.5">
        <span
          className="truncate font-mono text-[14px] font-semibold leading-snug text-background-10"
          title={name.toString()}
        >
          {name}
        </span>
        <div className="flex flex-wrap items-center gap-1">
          <TrackerStatus
            status={tracker.status}
            recovery={tracker.recovery}
            bodyPart={tracker.info?.bodyPart}
          />
          {problems.map((problem) => (
            <span
              key={problem.label}
              className={classNames(
                'rounded-[3px] border px-1.5 py-px font-mono text-[10.5px] uppercase tracking-wide whitespace-nowrap',
                problem.tone
              )}
            >
              {problem.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TrackerRotCell({
  tracker,
  precise,
  color,
  referenceAdjusted,
}: {
  tracker: TrackerDataT;
  precise?: boolean;
  color?: string;
  referenceAdjusted?: boolean;
}) {
  const { useRawRotationEulerDegrees, useRefAdjRotationEulerDegrees } =
    useTracker(tracker);

  const rotationRaw = useRawRotationEulerDegrees();
  const rotationRef = useRefAdjRotationEulerDegrees() || rotationRaw;
  const rot = referenceAdjusted ? rotationRef : rotationRaw;

  return (
    <Typography color={color} whitespace="whitespace-nowrap">
      {formatVector3(rot, precise ? 2 : 0)}
    </Typography>
  );
}

function Header({
  name,
  first = false,
  last = false,
  show = true,
}: {
  first?: boolean;
  last?: boolean;
  name: string;
  className?: string;
  show?: boolean;
}) {
  return (
    <div
      className={classNames('text-start px-2 flex items-center', {
        hidden: !show,
        'pl-4': first,
        'pr-4': last,
      })}
    >
      <Typography id={name} whitespace="whitespace-nowrap" />
    </div>
  );
}

function Cell({
  children,
  first = false,
  last = false,
  show = true,
}: {
  children: ReactNode;
  first?: boolean;
  last?: boolean;
  show?: boolean;
}) {
  return (
    <div
      className={classNames(
        'tracker-list-cell px-2 py-2 flex items-center min-w-0',
        {
          hidden: !show,
          'pl-3': first,
          'pr-3': last,
        }
      )}
    >
      {children}
    </div>
  );
}

function Row({
  data,
  highlightedTrackers,
  clickedTracker,
  gridTemplateColumns,
  showType,
  showTemp,
  showTps,
  showRot,
}: {
  data: FlatDeviceTracker;
  highlightedTrackers: highlightedTrackers | undefined;
  clickedTracker: (tracker: TrackerDataT) => void;
  gridTemplateColumns: string;
  showType: boolean;
  showTemp: boolean;
  showTps: boolean;
  showRot: boolean;
}) {
  const { config } = useConfig();
  const fontColor = config?.devSettings?.highContrast ? 'primary' : 'secondary';
  const moreInfo = config?.devSettings?.moreInfo;

  const { tracker, device } = data;
  const rowRef = useRef<HTMLDivElement>(null);
  const isMoving = useMotionGlow(tracker, rowRef);
  const isDisconnected = tracker.status === TrackerStatusEnum.DISCONNECTED;
  const batteryPct = device?.hardwareStatus?.batteryPctEstimate;
  const batteryVoltage = device?.hardwareStatus?.batteryVoltage;
  const ping = device?.hardwareStatus?.ping;

  const warning =
    !!highlightedTrackers?.trackers.find(
      (t) =>
        t?.deviceId?.id === tracker.trackerId?.deviceId?.id &&
        t?.trackerNum === tracker.trackerId?.trackerNum
    ) && highlightedTrackers.step;

  return (
    <>
      <div className="relative z-10">
        <div className="absolute top-3 left-3">
          <FirmwareIcon tracker={tracker} device={device} />
        </div>
      </div>
      <Tooltip
        disabled={!warning}
        preferedDirection="top"
        content={
          warning && (
            <div className="flex gap-1 items-center text-status-warning">
              <WarningIcon width={20} />
              <Typography id={trackingchecklistIdtoLabel[warning.id]} />
            </div>
          )
        }
        spacing={-5}
      >
        <>
          <div
            ref={rowRef}
            className={classNames(
              'tracker-list-row group grid items-center',
              isMoving && 'tracker-card-moving',
              isDisconnected && 'tracker-list-row-offline'
            )}
            title={isDisconnected ? 'Offline' : undefined}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                clickedTracker(tracker);
              }
            }}
            style={{ gridTemplateColumns }}
            onClick={() => clickedTracker(tracker)}
          >
            <Cell first>
              {isDisconnected && <span className="sr-only">Offline</span>}
              <TrackerNameCell
                tracker={tracker}
                warning={warning}
                moving={isMoving}
                problems={trackerProblems({ isDisconnected, ping })}
              />
            </Cell>
            <Cell show={showType}>
              <span className="truncate font-mono text-[12px] text-background-30">
                {device?.hardwareInfo?.manufacturer || '--'}
              </span>
            </Cell>
            <Cell>
              <BatteryBar
                pct={isDisconnected ? null : batteryPct}
                voltage={
                  batteryVoltage != null && batteryVoltage > 0
                    ? `${batteryVoltage.toFixed(2)} V`
                    : null
                }
              />
            </Cell>
            <Cell>
              <SignalPing
                rssi={device?.hardwareStatus?.rssi}
                ping={ping}
                disconnected={isDisconnected}
              />
            </Cell>
            <Cell show={showTps}>
              {tracker.tps && (
                <Typography color={fontColor}>{tracker.tps}</Typography>
              )}
            </Cell>
            <Cell show={showRot}>
              <TrackerRotCell
                tracker={tracker}
                precise={config?.devSettings?.preciseRotation}
                referenceAdjusted={!config?.devSettings?.rawSlimeRotation}
                color={fontColor}
              />
            </Cell>
            <Cell last={!moreInfo} show={showTemp}>
              {tracker?.temp && tracker?.temp?.temp != 0 && (
                <Typography color={fontColor} whitespace="whitespace-nowrap">
                  {tracker.temp.temp.toFixed(2)}
                </Typography>
              )}
            </Cell>
            <Cell show={moreInfo}>
              {tracker.linearAcceleration && (
                <Typography color={fontColor} whitespace="whitespace-nowrap">
                  {formatVector3(tracker.linearAcceleration, 1)}
                </Typography>
              )}
            </Cell>
            <Cell show={moreInfo}>
              {tracker.position && (
                <Typography color={fontColor} whitespace="whitespace-nowrap">
                  {formatVector3(tracker.position, 2)}
                </Typography>
              )}
            </Cell>
            <Cell show={moreInfo}>
              <StayAlignedInfo color={fontColor} tracker={tracker} />
            </Cell>
            <Cell last={moreInfo} show={moreInfo}>
              <Typography color={fontColor} whitespace="whitespace-nowrap">
                udp://
                {IPv4.fromNumber(
                  device?.hardwareInfo?.ipAddress?.addr || 0
                ).toString()}
              </Typography>
            </Cell>
            {/* Motion rim, as on the cards. */}
            <span
              aria-hidden="true"
              className="tracker-motion-rim"
              style={
                { '--battery-low': batteryRedness(batteryPct) } as CSSProperties
              }
            />
          </div>
        </>
      </Tooltip>
    </>
  );
}

export function TrackersTable({
  flatTrackers,
  clickedTracker,
}: {
  clickedTracker: (tracker: TrackerDataT) => void;
  flatTrackers: FlatDeviceTracker[];
}) {
  const { config } = useConfig();
  const { highlightedTrackers } = useTrackingChecklist();

  const filteringEnabled =
    config?.debug && config?.devSettings?.filterSlimesAndHMD;
  const sortingEnabled = config?.debug && config?.devSettings?.sortByName;

  const filteredSortedTrackers = useMemo(() => {
    const list = filteringEnabled
      ? flatTrackers.filter((t) => isHMD(t) || isSlime(t))
      : flatTrackers;

    if (sortingEnabled) {
      list.sort((a, b) => getTrackerName(a).localeCompare(getTrackerName(b)));
    }
    return list;
  }, [flatTrackers, filteringEnabled, sortingEnabled]);

  const moreInfo = config?.devSettings?.moreInfo;
  // The "more info" columns show stay-aligned data.
  useFeedDemand(trackerDetailCountAtom, !!moreInfo);

  // Columns no tracker has data for (often Type and Temp) are left out. When the list is narrow (the live skeleton
  // is open), the detail columns drop out as well, like the cards reflowing, instead of being cut off.
  const { ref: listRef, width } = useElemSize<HTMLDivElement>();
  const preciseRotation = !!config?.devSettings?.preciseRotation;
  const fit = fitColumns(moreInfo ? 0 : width, {
    type: filteredSortedTrackers.some(
      ({ device }) => !!device?.hardwareInfo?.manufacturer
    ),
    temp: filteredSortedTrackers.some(({ tracker }) => !!tracker.temp?.temp),
    preciseRotation,
  });
  const { type: showType, temp: showTemp, tps: showTps, rot: showRot } = fit;

  const gridTemplateColumns = useMemo(() => {
    const cols = [
      'minmax(12rem, 1.6fr)', // Name
      ...(showType ? ['6rem'] : []), // Type
      '7.5rem', // Battery
      '6.5rem', // Ping and signal
      ...(showTps ? ['3.5rem'] : []), // TPS
      ...(showRot ? [preciseRotation ? '9rem' : '7rem'] : []), // Rotation
      ...(showTemp ? ['4.5rem'] : []), // Temp
    ];

    if (moreInfo) {
      cols.push('9rem'); // Linear Acc
      cols.push('9rem'); // Position
      cols.push('9rem'); // Stay Aligned
      cols.push('11rem'); // URL
    }

    return cols.join(' ');
  }, [preciseRotation, moreInfo, showType, showTemp, showTps, showRot]);

  return (
    <div ref={listRef} className="tracker-list w-full overflow-x-auto p-2">
      <div className="min-w-fit">
        <div
          className="tracker-list-header grid items-center mb-2"
          style={{ gridTemplateColumns }}
        >
          <Header name={'tracker-table-column-name'} first />
          <Header name={'tracker-table-column-type'} show={showType} />
          <Header name={'tracker-table-column-battery'} />
          <Header name={'tracker-table-column-ping'} />
          <Header name={'tracker-table-column-tps'} show={showTps} />
          <Header name={'tracker-table-column-rotation'} show={showRot} />
          <Header
            name={'tracker-table-column-temperature'}
            last={!moreInfo}
            show={showTemp}
          />
          <Header
            name={'tracker-table-column-linear-acceleration'}
            show={moreInfo}
          />
          <Header name={'tracker-table-column-position'} show={moreInfo} />
          <Header name={'tracker-table-column-stay_aligned'} show={moreInfo} />
          <Header
            name={'tracker-table-column-url'}
            show={moreInfo}
            last={moreInfo}
          />
        </div>
        <div className="tracker-list-body flex flex-col gap-2">
          {filteredSortedTrackers.map((data, index) => (
            <div
              key={`${data.device?.id?.id ?? 'dev'}_${data.tracker.trackerId?.trackerNum ?? index}_${index}`}
              style={{ animationDelay: `${Math.min(index * 35, 280)}ms` }}
              className={classNames(
                'w-full',
                index % 2 === 0
                  ? 'animate-tracker-slide-left'
                  : 'animate-tracker-slide-right'
              )}
            >
              <Row
                clickedTracker={clickedTracker}
                data={data}
                highlightedTrackers={highlightedTrackers}
                gridTemplateColumns={gridTemplateColumns}
                showType={showType}
                showTemp={showTemp}
                showTps={showTps}
                showRot={showRot}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

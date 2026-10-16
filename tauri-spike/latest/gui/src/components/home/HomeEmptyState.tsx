import { useEffect, useRef, useState } from 'react';
import { RippleDots } from '@/components/commons/RippleDots';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAtomValue, useAtom } from 'jotai';
import {
  assignedTrackersAtom,
  unassignedTrackersAtom,
  hasRealTrackersAtom,
  active3DTrackerKeysAtom,
  cardMorphOriginAtom,
  CardMorphOrigin,
} from '@/store/app-store';
import { useSidebarPushAnimation } from '@/hooks/sidebar-animation';
import { demoModeAtom, toggleDemoModeAtom } from '@/store/demo-trackers';
import { useTracker } from '@/hooks/tracker';
import { BodyPartIcon } from '@/components/commons/BodyPartIcon';
import { PixelIcon } from '@/components/commons/PixelIcon';
import { SlimeVRIcon } from '@/components/commons/icon/SimevrIcon';
import { useConfig } from '@/hooks/config';
import { CardIMUVisualizer } from '@/components/widgets/IMUVisualizerWidget';
import {
  TrackerDataT,
  DeviceDataT,
  TrackerStatus as TrackerStatusEnum,
} from 'solarxr-protocol';
import classNames from 'classnames';

export function ClaudeTrackerWindowCard({
  tracker,
  device,
  onClick,
}: {
  tracker: TrackerDataT;
  device?: DeviceDataT;
  onClick?: (origin: CardMorphOrigin) => void;
}) {
  const { useName, useVelocity } = useTracker(tracker);
  const trackerName = useName();
  const velocity = useVelocity();
  const isDemo = useAtomValue(demoModeAtom);
  const { config } = useConfig();
  const bun = config?.theme === 'bun';

  const batteryPct = device?.hardwareStatus?.batteryPctEstimate;
  const batteryVoltage = device?.hardwareStatus?.batteryVoltage;
  const rssi = device?.hardwareStatus?.rssi;

  // Demo motion simulation: active trackers cycle motion naturally for demonstration
  const [demoMoving, setDemoMoving] = useState(false);
  const [active3DKeys, setActive3DKeys] = useAtom(active3DTrackerKeysAtom);
  const trackerKey = tracker.trackerId
    ? `${tracker.trackerId.deviceId?.id ?? device?.id?.id ?? 'd'}:${tracker.trackerId.trackerNum ?? 0}`
    : `${tracker.info?.bodyPart ?? 'unknown'}`;
  const show3D = active3DKeys.includes(trackerKey);

  // Sets the 3D view on or off, for the Bun 2D | 3D switch.
  const set3D = (on: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    setActive3DKeys((prev) =>
      on
        ? prev.includes(trackerKey)
          ? prev
          : [...prev, trackerKey]
        : prev.filter((k) => k !== trackerKey)
    );
  };

  const toggle3D = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActive3DKeys((prev) =>
      prev.includes(trackerKey)
        ? prev.filter((k) => k !== trackerKey)
        : [...prev, trackerKey]
    );
  };

  useEffect(() => {
    if (
      !isDemo ||
      tracker.status === TrackerStatusEnum.DISCONNECTED ||
      (batteryPct != null && batteryPct <= 0)
    ) {
      setDemoMoving(false);
      return;
    }

    const offset = (Number(tracker.trackerId?.deviceId?.id ?? 1) * 700) % 3500;
    let isMounted = true;
    let intervalId: NodeJS.Timeout;

    const timeoutId = setTimeout(() => {
      if (!isMounted) return;
      intervalId = setInterval(() => {
        if (!isMounted) return;
        setDemoMoving(true);
        setTimeout(() => {
          if (isMounted) setDemoMoving(false);
        }, 2400);
      }, 4400);
    }, offset);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [isDemo, tracker.status, tracker.trackerId?.deviceId?.id, batteryPct]);

  const isMoving = velocity > 0.18 || demoMoving;
  const isDisconnected = tracker.status === TrackerStatusEnum.DISCONNECTED;

  const ping = device?.hardwareStatus?.ping;

  // Format top-right window tag: show 0% when offline/dead, exact % when connected
  let tag = 'Active';
  if (isDisconnected) {
    tag = '0%';
  } else if (batteryPct != null) {
    tag = `${Math.round(batteryPct)}%`;
  } else if (batteryVoltage != null && batteryVoltage > 0) {
    tag = `${batteryVoltage.toFixed(1)}V`;
  }

  // Format subtitle description: voltage, ping latency, and connection status
  const descItems: string[] = [];
  if (batteryVoltage != null && batteryVoltage > 0) {
    descItems.push(`${batteryVoltage.toFixed(1)}V`);
  }
  if (isDisconnected) {
    descItems.push('Sensor offline');
  } else {
    if (ping != null && ping > 0) {
      descItems.push(`${ping}ms ping`);
    }
    descItems.push('Connected · Steady');
  }

  const getBallColors = (): [string, string, string] => {
    if (isDisconnected || batteryPct == null) {
      return isDisconnected
        ? ['bg-background-40', 'bg-background-40', 'bg-background-40']
        : [
            'bg-[rgb(96,198,120)]',
            'bg-[rgb(96,198,120)]',
            'bg-[rgb(96,198,120)]',
          ];
    }
    if (batteryPct >= 90)
      return [
        'bg-[rgb(96,198,120)]',
        'bg-[rgb(96,198,120)]',
        'bg-[rgb(96,198,120)]',
      ];
    if (batteryPct >= 80)
      return [
        'bg-[rgb(96,198,120)]',
        'bg-[rgb(96,198,120)]',
        'bg-[rgb(232,168,72)]',
      ];
    if (batteryPct >= 60)
      return [
        'bg-[rgb(96,198,120)]',
        'bg-[rgb(96,198,120)]',
        'bg-[rgb(234,98,86)]',
      ];
    if (batteryPct >= 40)
      return [
        'bg-[rgb(96,198,120)]',
        'bg-[rgb(232,168,72)]',
        'bg-[rgb(234,98,86)]',
      ];
    if (batteryPct >= 20)
      return [
        'bg-[rgb(232,168,72)]',
        'bg-[rgb(234,98,86)]',
        'bg-[rgb(234,98,86)]',
      ];
    if (batteryPct > 0)
      return [
        'bg-[rgb(234,98,86)]',
        'bg-[rgb(234,98,86)]',
        'bg-[rgb(234,98,86)]',
      ];
    return [
      'bg-[rgba(234,98,86,0.5)]',
      'bg-[rgba(234,98,86,0.5)]',
      'bg-[rgba(234,98,86,0.5)]',
    ];
  };

  const [ball1, ball2, ball3] = getBallColors();

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const origin: CardMorphOrigin = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      borderRadius:
        window.getComputedStyle(e.currentTarget).borderRadius || '12px',
      trackerIdKey: `${device?.id?.id ?? 'dev'}_${tracker.trackerId?.trackerNum ?? 0}`,
    };
    onClick?.(origin);
  };

  return (
    <div
      onClick={handleCardClick}
      className={classNames(
        'home-tracker-card group relative flex flex-col rounded-[12px] overflow-hidden bg-background-60 border transition-[border-color,box-shadow,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer select-none hover:-translate-y-0.5 active:scale-[0.985] active:duration-150',
        isMoving
          ? 'tracker-card-moving'
          : 'border-background-10/[0.08] hover:border-background-10/[0.2] shadow-xs hover:shadow-lg'
      )}
    >
      {/* Card Header Banner */}
      <div className="home-tracker-card__banner relative h-30 sm:h-32 w-full bg-background-70 border-b border-background-10/[0.06] overflow-hidden flex flex-col justify-between p-2.5 select-none transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
        {/* Card controls */}
        <div className="relative z-10 flex items-center justify-between">
          <div
            className="home-tracker-card__dots flex items-center gap-1.5"
            title={
              isDisconnected
                ? 'Disconnected'
                : batteryPct != null
                  ? `Battery: ${Math.round(batteryPct)}%`
                  : 'Active'
            }
          >
            <span
              className={classNames(
                'h-2 w-2 shrink-0 rounded-full transition-colors duration-300',
                ball1
              )}
            />
            <span
              className={classNames(
                'h-2 w-2 shrink-0 rounded-full transition-colors duration-300',
                ball2
              )}
            />
            <span
              className={classNames(
                'h-2 w-2 shrink-0 rounded-full transition-colors duration-300',
                ball3
              )}
            />
          </div>
          <div className="flex items-center gap-2">
            {bun ? (
              <div
                role="group"
                aria-label="Preview mode"
                className="flex items-center gap-0.5 rounded-[3px] border border-background-10/[0.1] bg-background-10/[0.04] p-0.5"
              >
                {(['2D', '3D'] as const).map((mode) => {
                  const active = mode === '3D' ? show3D : !show3D;
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={active}
                      onClick={(e) => set3D(mode === '3D', e)}
                      title={
                        mode === '3D'
                          ? 'Show the live 3D view'
                          : 'Show the body icon'
                      }
                      className={classNames(
                        'rounded-[2px] px-2.5 py-1 font-mono text-[13px] tracking-wide select-none cursor-pointer transition-colors',
                        active
                          ? 'bg-accent-background-30 text-background-90'
                          : 'text-background-30 hover:text-background-10'
                      )}
                    >
                      {mode}
                    </button>
                  );
                })}
              </div>
            ) : (
            <button
              type="button"
              onClick={toggle3D}
              className={classNames(
                'px-1.5 py-0.5 rounded text-ui-2xs font-mono font-medium transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.95] cursor-pointer select-none flex items-center gap-1 border',
                show3D
                  ? 'tracker-accent-fill bg-accent-background-20 border-accent-background-20 text-white shadow-xs'
                  : 'bg-background-10/[0.04] hover:bg-background-10/[0.08] border-background-10/[0.08] text-background-30 hover:text-background-10'
              )}
              title={show3D ? 'Hide 3D realtime view' : 'Show 3D realtime view'}
            >
              <svg
                className="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              <span>3D</span>
            </button>
            )}
            <span className="home-tracker-card__tag text-ui-2xs font-mono font-medium text-background-30 tracking-wide">
              {tag}
            </span>
          </div>
        </div>

        {/* Main Graphic / 3D Realtime IMU Render Area */}
        <div className="relative z-10 w-full flex-grow flex items-center">
          {show3D ? (
            <div className="w-full h-full flex items-center justify-between">
              {/* Tracker body icon shifted smoothly to the left */}
              <div
                className={classNames(
                  'tracker-accent shrink-0 pl-0.5 transition-all duration-250 ease-out',
                  isMoving
                    ? 'tracker-moving scale-[1.03] text-motion fill-motion drop-shadow-[0_0_6px_rgba(var(--motion),0.6)]'
                    : classNames(
                        isDemo
                          ? 'tracker-demo-idle'
                          : 'opacity-85 text-accent-background-10 fill-accent-background-20'
                      )
                )}
              >
                <BodyPartIcon bodyPart={tracker.info?.bodyPart} width={34} />
              </div>

              {/* Realtime 3D Render filling the remaining ~80% of the banner */}
              <div className="flex-grow h-full w-full relative flex items-center justify-center pointer-events-none overflow-hidden">
                <CardIMUVisualizer tracker={tracker} height={bun ? 66 : 105} />
              </div>
            </div>
          ) : (
            /* Centered Graphic Icon - Limb Silhouette with Movement Pulse */
            <div
              className={classNames(
                'tracker-accent w-full flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                isMoving
                  ? 'tracker-moving scale-[1.06] -translate-y-0.5 text-motion fill-motion drop-shadow-[0_0_10px_rgba(var(--motion),0.7)]'
                  : classNames(
                      'group-hover:scale-105',
                      isDemo
                        ? 'tracker-demo-idle'
                        : 'text-accent-background-10 fill-accent-background-20'
                    )
              )}
            >
              <BodyPartIcon bodyPart={tracker.info?.bodyPart} width={46} />
            </div>
          )}
        </div>
      </div>

      {bun ? (
        <TrackerCardStats
          name={trackerName}
          isDisconnected={isDisconnected}
          isMoving={isMoving}
          batteryPct={batteryPct}
          batteryVoltage={batteryVoltage}
          ping={ping}
          rssi={rssi}
        />
      ) : (
      /* Card Body */
      <div className="p-3 sm:p-3.5 flex flex-col flex-grow justify-between">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-serif text-ui-xs sm:text-ui-sm font-normal tracking-tight transition-colors truncate text-background-10 group-hover:text-accent-background-20">
              {trackerName}
            </h3>
            {isDisconnected ? (
              <span className="px-1.5 py-0.5 rounded-[5px] text-ui-2xs font-mono font-medium uppercase shrink-0 bg-background-10/[0.04] text-background-40 border border-background-10/[0.06]">
                Offline
              </span>
            ) : (
              <span
                className={classNames(
                  'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[5px] text-ui-2xs font-mono font-medium shrink-0 border transition-colors',
                  ping == null || ping <= 40
                    ? 'bg-status-success/10 text-status-success border-status-success/20'
                    : ping <= 90
                      ? 'bg-status-warning/10 text-status-warning border-status-warning/20'
                      : 'bg-status-critical/10 text-status-critical border-status-critical/20'
                )}
                title={ping != null ? `Ping latency: ${ping}ms` : 'Connected'}
              >
                <span
                  className={classNames(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    ping == null || ping <= 40
                      ? 'bg-status-success'
                      : ping <= 90
                        ? 'bg-status-warning'
                        : 'bg-status-critical'
                  )}
                />
                {ping != null ? `${ping}ms` : 'Connected'}
              </span>
            )}
          </div>
          <p className="mt-1 text-ui-2xs leading-snug text-background-30 font-sans truncate">
            {descItems.join(' · ')}
          </p>
        </div>
      </div>
      )}
    </div>
  );
}

/** Bun: the card footer. The name gets room for two lines, the status is a pill, and each reading has a label. */
function TrackerCardStats({
  name,
  isDisconnected,
  isMoving,
  batteryPct,
  batteryVoltage,
  ping,
  rssi,
}: {
  name: string;
  isDisconnected: boolean;
  isMoving: boolean;
  batteryPct?: number | null;
  batteryVoltage?: number | null;
  ping?: number | null;
  rssi?: number | null;
}) {
  const status = isDisconnected ? 'Offline' : isMoving ? 'Moving' : 'Connected';
  const statusTone = isDisconnected
    ? 'text-background-30'
    : isMoving
      ? 'text-motion'
      : 'text-status-success';
  const batteryTone =
    batteryPct == null
      ? undefined
      : batteryPct <= 20
        ? 'text-status-critical'
        : batteryPct <= 40
          ? 'text-status-warning'
          : undefined;
  const pingTone =
    ping == null || ping <= 0
      ? undefined
      : ping <= 40
        ? 'text-status-success'
        : ping <= 90
          ? 'text-status-warning'
          : 'text-status-critical';

  return (
    <div className="flex flex-grow flex-col gap-2 p-2.5 sm:p-3">
      <div className="flex items-start justify-between gap-2">
        <h3
          className="home-tracker-card__name min-w-0 font-serif text-[15px] font-semibold leading-snug text-background-10 transition-colors group-hover:text-accent-background-20"
          title={name}
        >
          {name}
        </h3>
        <span
          className={classNames(
            'shrink-0 rounded-[3px] border border-background-10/[0.1] bg-background-10/[0.04] px-1.5 py-px font-mono text-[12px] uppercase tracking-wide',
            statusTone
          )}
        >
          {status}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-1">
        <TrackerStat
          label="Battery"
          value={batteryPct != null ? `${Math.round(batteryPct)}%` : '--'}
          tone={batteryTone}
        />
        <TrackerStat
          label="Voltage"
          value={
            batteryVoltage != null && batteryVoltage > 0
              ? `${batteryVoltage.toFixed(1)}V`
              : '--'
          }
        />
        <TrackerStat
          label="Ping"
          value={ping != null && ping > 0 ? `${ping}ms` : '--'}
          tone={pingTone}
        />
        <TrackerStat
          label="Signal"
          value={rssi != null ? `${rssi} dBm` : '--'}
        />
      </dl>
    </div>
  );
}

function TrackerStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-[3px] border border-background-10/[0.06] bg-background-10/[0.03] px-2 py-1">
      <dt className="font-mono text-[12px] uppercase tracking-wide text-background-30">
        {label}
      </dt>
      <dd
        className={classNames(
          'tnum truncate text-[15px] font-medium leading-snug text-background-10',
          tone
        )}
      >
        {value}
      </dd>
    </div>
  );
}

const SETUP_STEPS = [
  {
    title: 'Power on your trackers',
    detail: 'Keep them within Wi-Fi range of this computer.',
  },
  {
    title: 'Wait for them to connect',
    detail: 'They show up here on their own.',
  },
  {
    title: 'Assign each one to a body part',
    detail: 'Pick where every tracker is worn.',
  },
];

const SETUP_LINKS = [
  { to: '/onboarding/body-proportions/auto', label: 'Body proportions' },
  { to: '/settings/osc/vrchat', label: 'Quest & VRChat OSC' },
  { to: '/settings/serial', label: 'Serial diagnostics' },
];

/** Shown while no tracker is connected: what to do next, in order. */
function TrackerEmptyState({ onSimulateDemo }: { onSimulateDemo: () => void }) {
  const { config } = useConfig();
  const bun = config?.theme === 'bun';
  const animate = config?.animations !== false;
  const logoRef = useRef<HTMLSpanElement>(null);
  return (
    <section
      aria-labelledby="tracker-empty-title"
      className="relative isolate flex w-full flex-col items-center overflow-hidden rounded-[14px] border border-[var(--material-border-subtle)] bg-background-70 px-6 py-10 text-center shadow-[inset_0_1px_0_0_rgba(250,249,245,0.04)] sm:py-12"
    >
      {/* Bun: the logo hops and lands every 4.2 s, and the water ripple starts at the landing (see tracker-logo-hop). */}
      {bun && <RippleDots originEl={logoRef} gapMin={4200} gapMax={4200} />}
      <div className="relative flex h-14 w-14 items-center justify-center">
        {!bun && (
          <span
            aria-hidden="true"
            className="animate-search-pulse pointer-events-none absolute h-14 w-14 rounded-full border border-accent-background-20/40"
          />
        )}
        <span
          ref={logoRef}
          className={classNames(
            'tracker-empty-logo relative flex h-14 w-14 items-center justify-center rounded-full border border-accent-background-20/30 bg-accent-background-20/10',
            bun && animate && 'tracker-logo-hop'
          )}
        >
          {/* Bun: the logo is redrawn as pixel art, like the sidebar logo. */}
          <PixelIcon size={34} grid={28}>
            <SlimeVRIcon width={26} height={15} className="home-accent" />
          </PixelIcon>
        </span>
      </div>

      <h2
        id="tracker-empty-title"
        className="mt-5 font-serif text-ui-lg font-normal tracking-tight text-background-10"
      >
        Waiting for trackers
      </h2>
      <p className="mt-1.5 max-w-[420px] text-ui-xs text-background-30">
        Turn on your trackers near this computer. They connect on their own and
        appear here.
      </p>

      <ol className="mt-6 flex w-full max-w-[420px] flex-col divide-y divide-[var(--material-border-subtle)] text-left">
        {SETUP_STEPS.map((step, index) => (
          <li key={step.title} className="flex items-center gap-3 py-2.5">
            <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background-10/[0.08] text-ui-2xs font-medium text-background-20">
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-ui-xs font-medium text-background-10">
                {step.title}
              </span>
              <span className="text-ui-2xs text-background-30">
                {step.detail}
              </span>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <NavLink
          to="/onboarding/trackers-assign"
          className="inline-flex h-8 items-center rounded-[8px] bg-accent-background-20 px-3.5 text-ui-xs font-medium text-white transition-colors hover:bg-accent-background-40"
        >
          Assign trackers
        </NavLink>
        <button
          type="button"
          onClick={onSimulateDemo}
          className="inline-flex h-8 cursor-pointer items-center rounded-[8px] px-3 text-ui-xs font-medium text-background-20 transition-colors hover:bg-background-10/[0.08] hover:text-background-10"
        >
          Simulate demo trackers
        </button>
      </div>

      <nav
        aria-label="Setup tools"
        className="mt-8 flex w-full max-w-[420px] flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-[var(--material-border-subtle)] pt-4 text-ui-2xs"
      >
        <span className="text-background-40">Setup tools</span>
        {SETUP_LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className="text-background-20 transition-colors hover:text-accent-background-10"
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </section>
  );
}

export function HomeEmptyState({
  viewSwitchKey = null,
  cardLayoutTransitionKey = null,
  suppressGridEntrance = false,
}: {
  viewSwitchKey?: number | null;
  cardLayoutTransitionKey?: number | null;
  suppressGridEntrance?: boolean;
}) {
  const assignedTrackers = useAtomValue(assignedTrackersAtom);
  const unassignedTrackers = useAtomValue(unassignedTrackersAtom);
  const demoMode = useAtomValue(demoModeAtom);
  const hasRealTrackers = useAtomValue(hasRealTrackersAtom);
  const [, toggleDemoMode] = useAtom(toggleDemoModeAtom);
  const allTrackers = [...assignedTrackers, ...unassignedTrackers];
  const navigate = useNavigate();
  const cardLayoutTransitionSeen = useRef(cardLayoutTransitionKey != null);
  if (cardLayoutTransitionKey != null) {
    cardLayoutTransitionSeen.current = true;
  }

  const trackersTabAnim = useSidebarPushAnimation(3);
  const cardTransitionKey =
    cardLayoutTransitionKey ??
    (trackersTabAnim.animKey > 0 ? trackersTabAnim.animKey : null);

  const [, setCardMorphOrigin] = useAtom(cardMorphOriginAtom);

  const [growingCard, setGrowingCard] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
    borderRadius: string;
    phase: 'start' | 'expanding';
  } | null>(null);

  const sendToSettings = (tracker: TrackerDataT, origin?: CardMorphOrigin) => {
    if (origin) {
      setCardMorphOrigin(origin);
    }

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    if (prefersReducedMotion || !origin) {
      navigate(
        `/tracker/${tracker.trackerId?.trackerNum}/${tracker.trackerId?.deviceId?.id}`
      );
      return;
    }

    setGrowingCard({
      top: origin.top,
      left: origin.left,
      width: origin.width,
      height: origin.height,
      borderRadius: origin.borderRadius || '12px',
      phase: 'start',
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setGrowingCard((prev) =>
          prev
            ? {
                ...prev,
                top: 0,
                left: 0,
                width: window.innerWidth,
                height: window.innerHeight,
                borderRadius: '0px',
                phase: 'expanding',
              }
            : null
        );
      });
    });

    setTimeout(() => {
      navigate(
        `/tracker/${tracker.trackerId?.trackerNum}/${tracker.trackerId?.deviceId?.id}`
      );
    }, 280);

    setTimeout(() => {
      setGrowingCard(null);
    }, 450);
  };

  const viewContentMotion = (depth: number): React.CSSProperties | undefined =>
    viewSwitchKey == null
      ? undefined
      : ({
          '--view-content-delay': `${depth * 45}ms`,
        } as React.CSSProperties);

  return (
    <div className="home-workspace w-full flex-grow flex flex-col select-none">
      {/* SPLIT 2: Trackers Cards Grid Section (Deeper Obsidian Surface extending to screen bottom) */}
      <div
        className={classNames(
          'home-tracker-surface w-full flex-grow flex flex-col justify-between items-center bg-background-80',
          'py-10 sm:py-14 px-6'
        )}
      >
        <div className="w-full max-w-[980px] flex flex-col items-center">
          {/* Section Heading: "Trackers" with Live Count and Demo Switch */}
          {allTrackers.length > 0 && (
            <div
              style={{
                ...trackersTabAnim.style,
                ...viewContentMotion(0),
              }}
              className={classNames(
                'w-full max-w-[980px] mb-6 flex items-end justify-between',
                viewSwitchKey != null && 'animate-view-content-settle',
                trackersTabAnim.className
              )}
            >
              <div className="flex flex-col">
                <div className="flex items-center gap-3">
                  <h2 className="font-serif text-ui-lg sm:text-ui-lg font-normal tracking-tight text-background-10">
                    Trackers
                  </h2>
                  {demoMode && !hasRealTrackers && (
                    <span className="px-2 py-0.5 rounded-full text-ui-2xs font-mono font-medium tracking-wide bg-accent-background-20/15 text-accent-background-10 border border-accent-background-20/30 animate-pulse">
                      DEMO MODE
                    </span>
                  )}
                </div>
                {allTrackers.length > 0 && (
                  <span
                    key={allTrackers.length}
                    className="text-ui-2xs font-mono font-medium text-background-30 mt-0.5 animate-found-pop"
                  >
                    {allTrackers.length} Active
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                {unassignedTrackers.length > 0 && (
                  <NavLink
                    to="/onboarding/trackers-assign"
                    className="text-ui-2xs px-2.5 py-1 rounded-md border border-accent-background-20/40 bg-accent-background-20/15 text-accent-background-10 font-medium select-none hover:bg-accent-background-20/25"
                  >
                    Assign trackers ({unassignedTrackers.length})
                  </NavLink>
                )}
                {!hasRealTrackers && demoMode && (
                  <button
                    type="button"
                    onClick={toggleDemoMode}
                    className="demo-exit-button cursor-pointer select-none rounded-md border border-accent-background-20/40 bg-accent-background-20/15 px-2.5 py-1 text-ui-2xs font-medium text-accent-background-10 transition-colors hover:bg-accent-background-20/25"
                    title="Stop the simulated tracker demo"
                  >
                    Exit Demo
                  </button>
                )}
              </div>
            </div>
          )}

          {allTrackers.length > 0 ? (
            /* Live Connected Trackers Rendered As Claude Window Cards */
            <div
              className={classNames(
                'grid gap-5 sm:gap-6 w-full max-w-[980px]',
                'grid-cols-2'
              )}
            >
              {allTrackers.map(({ tracker, device }, idx) => {
                const cols = 2;
                const col = idx % cols;
                const row = Math.floor(idx / cols);

                const isCardLayoutTransition = cardTransitionKey != null;
                const suppressInitialEntrance =
                  suppressGridEntrance || cardLayoutTransitionSeen.current;
                const animClass = isCardLayoutTransition
                  ? 'animate-tracker-layout-enter'
                  : suppressInitialEntrance
                    ? ''
                    : 'animate-tracker-grid-enter';
                const animStyle: React.CSSProperties = {
                  animationDelay: isCardLayoutTransition
                    ? '0ms'
                    : `${row * 80 + col * 35}ms`,
                } as React.CSSProperties;

                return (
                  <div
                    key={`${device?.id?.id ?? 'dev'}_${tracker.trackerId?.trackerNum ?? idx}_${idx}_${cardTransitionKey ?? 'initial'}`}
                    style={animStyle}
                    className={classNames('w-full', animClass)}
                  >
                    <ClaudeTrackerWindowCard
                      tracker={tracker}
                      device={device}
                      onClick={(origin) => sendToSettings(tracker, origin)}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <TrackerEmptyState onSimulateDemo={toggleDemoMode} />
          )}
        </div>
      </div>

      {growingCard && (
        <div
          className="fixed pointer-events-none z-[9999] will-change-[top,left,width,height,border-radius,box-shadow]"
          style={{
            top: growingCard.top,
            left: growingCard.left,
            width: growingCard.width,
            height: growingCard.height,
            borderRadius: growingCard.borderRadius,
            backgroundColor: 'rgb(var(--background-80))',
            boxShadow:
              growingCard.phase === 'start'
                ? '0 12px 36px rgba(0, 0, 0, 0.22)'
                : '0 0 0 rgba(0, 0, 0, 0)',
            transition:
              growingCard.phase === 'expanding'
                ? 'top 320ms cubic-bezier(0.2, 0.95, 0.3, 1), left 320ms cubic-bezier(0.2, 0.95, 0.3, 1), width 320ms cubic-bezier(0.2, 0.95, 0.3, 1), height 320ms cubic-bezier(0.2, 0.95, 0.3, 1), border-radius 320ms cubic-bezier(0.2, 0.95, 0.3, 1), box-shadow 320ms cubic-bezier(0.2, 0.95, 0.3, 1)'
                : 'none',
          }}
        />
      )}
    </div>
  );
}

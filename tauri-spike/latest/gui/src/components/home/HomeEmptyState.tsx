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
import { PawEars } from '@/components/commons/PawEars';
import { PixelIcon } from '@/components/commons/PixelIcon';
import { SlimeVRIcon } from '@/components/commons/icon/SimevrIcon';
import { isPawTheme, useConfig } from '@/hooks/config';
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
        }, 1200);
      }, 7000);
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
  const problems = trackerProblems({ isDisconnected, batteryPct, ping });

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

  // Compact card: icon on the left, name and problems in the middle, readings on the right.
  // Orange only marks motion; a quiet card means a healthy tracker.
  return (
    <div
      onClick={handleCardClick}
      className={classNames(
        'home-tracker-card group relative flex h-24 items-center gap-3 rounded-[12px] border bg-background-60 px-3 transition-[border-color,box-shadow] duration-500 cursor-pointer select-none active:scale-[0.985] active:duration-150',
        isMoving
          ? 'tracker-card-moving'
          : 'border-transparent hover:border-background-10/[0.2]'
      )}
    >
      <button
        type="button"
        onClick={toggle3D}
        title={show3D ? 'Show the body icon' : 'Show the live 3D view'}
        aria-pressed={show3D}
        className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-background-70 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20"
      >
        {show3D ? (
          <CardIMUVisualizer tracker={tracker} height={60} />
        ) : (
          <span
            className={classNames(
              'tracker-accent flex items-center justify-center',
              isMoving
                ? 'tracker-moving tracker-wiggle text-motion fill-motion'
                : 'text-background-20 fill-background-20'
            )}
          >
            <BodyPartIcon bodyPart={tracker.info?.bodyPart} width={40} />
          </span>
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3
          className="truncate font-mono text-[14px] font-semibold leading-snug text-background-10"
          title={trackerName}
        >
          {trackerName}
        </h3>
        {problems.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {problems.map((problem) => (
              <span
                key={problem.label}
                className={classNames(
                  'rounded-[3px] border px-1.5 py-px font-mono text-[10.5px] uppercase tracking-wide',
                  problem.tone
                )}
              >
                {problem.label}
              </span>
            ))}
          </div>
        ) : (
          <span className="font-sans text-ui-2xs text-background-30">
            Connected
          </span>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1 font-mono text-[12px] leading-none tnum">
        <span
          title={
            batteryVoltage != null && batteryVoltage > 0
              ? `Battery ${batteryPct != null ? `${Math.round(batteryPct)}% · ` : ''}${batteryVoltage.toFixed(2)} V`
              : 'Battery'
          }
          className={classNames(
            batteryPct == null
              ? 'text-background-30'
              : batteryPct < LOW_BATTERY_PCT
                ? 'text-status-critical'
                : batteryPct <= 40
                  ? 'text-status-warning'
                  : 'text-background-10'
          )}
        >
          {batteryPct != null ? `${Math.round(batteryPct)}%` : '--'}
        </span>
        <SignalBars rssi={isDisconnected ? null : rssi} />
        <span
          title="Ping"
          className={classNames(
            ping != null && ping > HIGH_PING_MS
              ? 'text-status-warning'
              : 'text-background-20'
          )}
        >
          {ping != null && ping > 0 ? `${ping}ms` : '--'}
        </span>
      </div>
    </div>
  );
}

const LOW_BATTERY_PCT = 15;
const HIGH_PING_MS = 50;

/** Chips appear only for something the user should act on. */
function trackerProblems({
  isDisconnected,
  batteryPct,
  ping,
}: {
  isDisconnected: boolean;
  batteryPct?: number | null;
  ping?: number | null;
}) {
  if (isDisconnected) {
    return [
      {
        label: 'Offline',
        tone: 'border-background-10/[0.12] text-background-30',
      },
    ];
  }
  const problems: { label: string; tone: string }[] = [];
  if (batteryPct != null && batteryPct < LOW_BATTERY_PCT) {
    problems.push({
      label: 'Low batt',
      tone: 'border-status-critical/30 text-status-critical',
    });
  }
  if (ping != null && ping > HIGH_PING_MS) {
    problems.push({
      label: 'High ping',
      tone: 'border-status-warning/30 text-status-warning',
    });
  }
  return problems;
}

/** Four signal bars from RSSI; the dBm value is in the tooltip. */
function SignalBars({ rssi }: { rssi?: number | null }) {
  const bars =
    rssi == null || rssi === 0
      ? 0
      : rssi >= -55
        ? 4
        : rssi >= -65
          ? 3
          : rssi >= -75
            ? 2
            : 1;
  return (
    <span
      className="flex h-3 items-end gap-[2px]"
      title={rssi != null && rssi !== 0 ? `Signal: ${rssi} dBm` : 'No signal'}
      role="img"
      aria-label={`Signal ${bars} of 4`}
    >
      {[1, 2, 3, 4].map((bar) => (
        <span
          key={bar}
          className={classNames(
            'w-[3px] rounded-[1px]',
            bar <= bars ? 'bg-background-10' : 'bg-background-10/[0.18]'
          )}
          style={{ height: `${bar * 25}%` }}
        />
      ))}
    </span>
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
  const bun = isPawTheme(config?.theme);
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
          {/* Fox and Dog: pixel ears on the logo, so they hop with it. */}
          <PawEars cell={34 / 28} on="badge" />
          {/* Bun: the logo is redrawn as pixel art, like the sidebar logo. */}
          <PixelIcon size={34} grid={28}>
            <SlimeVRIcon width={26} height={15} className="home-accent" />
          </PixelIcon>
        </span>
      </div>

      {/* The panel colour behind the text masks the dot matrix, so the headline reads cleanly. */}
      <div className="relative z-10 mt-4 flex flex-col items-center rounded-[10px] bg-background-70 px-4 py-1.5">
        <h2
          id="tracker-empty-title"
          className="font-serif text-ui-lg font-normal tracking-tight text-background-10"
        >
          Waiting for trackers
        </h2>
        <p className="mt-1.5 max-w-[420px] text-ui-xs text-background-30">
          Turn on your trackers near this computer. They connect on their own
          and appear here.
        </p>
      </div>

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
          title="Assign body parts once a tracker connects"
          className="inline-flex h-8 items-center rounded-[8px] border border-[var(--material-border-primary)] px-3.5 text-ui-xs font-medium text-background-20 transition-colors hover:bg-background-10/[0.06] hover:text-background-10"
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
        <span className="font-medium text-background-20">Setup tools</span>
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
        <div
          className={classNames(
            'w-full max-w-[980px] flex flex-col items-center',
            allTrackers.length === 0 && 'my-auto'
          )}
        >
          {/* Section Heading: "Trackers" with Live Count and Demo Switch */}
          {allTrackers.length > 0 && (
            <div
              style={{
                ...trackersTabAnim.style,
                ...viewContentMotion(0),
              }}
              className={classNames(
                'w-full max-w-[980px] mb-6 flex items-center justify-between',
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
                'grid w-full max-w-[980px] gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))]'
              )}
            >
              {allTrackers.map(({ tracker, device }, idx) => {
                const cols = 3;
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

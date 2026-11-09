import { CSSProperties, useRef } from 'react';
import { ContourDots } from '@/components/commons/ContourDots';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAtomValue, useAtom } from 'jotai';
import {
  assignedTrackerSetAtom,
  unassignedTrackerSetAtom,
  hasRealTrackersAtom,
  connectedIMUCountAtom,
  liveTrackerAtom,
  trackerKey,
  active3DTrackerKeysAtom,
} from '@/store/app-store';
import { useSidebarPushAnimation } from '@/hooks/sidebar-animation';
import { demoModeAtom, toggleDemoModeAtom } from '@/store/demo-trackers';
import { useMotionGlow, useTracker } from '@/hooks/tracker';
import { useTrackerPresets } from '@/hooks/presets';
import { BodyPartIcon } from '@/components/commons/BodyPartIcon';
import { PawEars } from '@/components/commons/PawEars';
import { PixelIcon } from '@/components/commons/PixelIcon';
import { SlimeVRIcon } from '@/components/commons/icon/SimevrIcon';
import { useConfig } from '@/hooks/config';
import { isPawTheme } from '@/hooks/theme';
import { CardIMUVisualizer } from '@/components/widgets/IMUVisualizerWidget';
import { batteryLevel, batteryRedness } from '@/utils/battery-cells';
import {
  BodyPart,
  TrackerDataT,
  DeviceDataT,
  TrackerStatus as TrackerStatusEnum,
} from 'solarxr-protocol';
import classNames from 'classnames';

// Demo icon gesture strength: degrees turned at a full-strength episode and px shifted. The headset is
// subtle (~4°), controllers swing widest (~25° on a strong move), legs and feet add a sideways weight shift.
function demoGestureStrength(bodyPart: BodyPart | undefined) {
  switch (bodyPart) {
    case BodyPart.HEAD:
      return { deg: 6, px: 0, reach: 0.55 };
    case BodyPart.LEFT_HAND:
    case BodyPart.RIGHT_HAND:
      return { deg: 26, px: 2, reach: 1 };
    case BodyPart.LEFT_UPPER_LEG:
    case BodyPart.RIGHT_UPPER_LEG:
    case BodyPart.LEFT_LOWER_LEG:
    case BodyPart.RIGHT_LOWER_LEG:
    case BodyPart.LEFT_FOOT:
    case BodyPart.RIGHT_FOOT:
      return { deg: 14, px: 2, reach: 0.85 };
    default:
      return { deg: 11, px: 0, reach: 0.8 };
  }
}

export function ClaudeTrackerWindowCard({
  tracker,
  device,
  onClick,
}: {
  tracker: TrackerDataT;
  device?: DeviceDataT;
  onClick?: () => void;
}) {
  const { useName, useIdentAdjRotationEulerDegrees } = useTracker(tracker);
  const trackerName = useName();
  // The icon leans with the tracker's roll (after reset), capped so it stays readable.
  const roll = useIdentAdjRotationEulerDegrees()?.z ?? 0;
  const tilt = Math.max(-25, Math.min(25, roll));
  const { config } = useConfig();
  const isDemo = useAtomValue(demoModeAtom);
  const batteryPct = device?.hardwareStatus?.batteryPctEstimate;
  const batteryVoltage = device?.hardwareStatus?.batteryVoltage;
  const rssi = device?.hardwareStatus?.rssi;

  const cardRef = useRef<HTMLDivElement>(null);
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

  const isDisconnected = tracker.status === TrackerStatusEnum.DISCONNECTED;
  // Demo trackers report no rotation, so one scene clock (sampleDemoScene) moves the icon in short
  // irregular turns and lights the halo and rim from that same motion; holds go quiet. Each card has its own
  // strength, direction and phase. Animations off, offline or empty battery keep it still.
  const demoGesture =
    config?.animations !== false &&
    isDemo &&
    !isDisconnected &&
    !(batteryPct != null && batteryPct <= 0);
  const gestureId = Number(tracker.trackerId?.deviceId?.id ?? 1);
  const strength = demoGestureStrength(tracker.info?.bodyPart);
  const sign = gestureId % 2 === 0 ? 1 : -1;
  const iconRef = useRef<HTMLSpanElement>(null);
  const isMoving = useMotionGlow(
    tracker,
    cardRef,
    demoGesture
      ? {
          id: gestureId,
          deg: strength.deg * sign,
          px: strength.px * sign,
          reach: strength.reach,
          icon: iconRef,
        }
      : null
  );

  const ping = device?.hardwareStatus?.ping;
  const problems = trackerProblems({ isDisconnected, ping });

  const voltageText =
    batteryVoltage != null && batteryVoltage > 0
      ? `${batteryVoltage.toFixed(2)} V`
      : null;

  // Tile card: a preview on top (pixel icon, or the live 3D view), readings below.
  // Orange only marks motion; a quiet card means a healthy tracker.
  return (
    <div
      ref={cardRef}
      onClick={onClick}
      className={classNames(
        'home-tracker-card group relative flex h-full flex-col overflow-hidden rounded-[18px] border bg-background-60 transition-[border-color,box-shadow,opacity,filter] duration-500 cursor-pointer select-none active:scale-[0.985] active:duration-150',
        'border-background-10/[0.16] hover:border-background-10/[0.3]',
        isMoving && 'tracker-card-moving',
        // Offline: the whole card dims and greys out instead of showing a chip; hover lifts it to stay readable.
        isDisconnected && 'opacity-40 grayscale hover:opacity-75'
      )}
      title={isDisconnected ? 'Offline' : undefined}
    >
      {isDisconnected && <span className="sr-only">Offline</span>}
      <div className="home-tracker-card__banner relative flex h-28 items-center justify-center bg-background-80">
        {problems.length > 0 && (
          <div className="card-problems absolute right-2 top-2 z-10 flex flex-wrap justify-end gap-1">
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
        )}
        {show3D ? (
          <div className="pointer-events-none flex h-full w-full items-center justify-center">
            <CardIMUVisualizer tracker={tracker} height={104} />
            {/* A small body-part icon, so the 3D view still says which tracker it is. */}
            <span
              aria-hidden="true"
              className={classNames(
                'tracker-accent absolute bottom-2 left-2 flex items-center justify-center rounded-[6px] bg-background-80/70 p-1',
                isMoving
                  ? 'tracker-moving text-motion fill-motion'
                  : 'text-background-20 fill-background-20'
              )}
            >
              <BodyPartIcon bodyPart={tracker.info?.bodyPart} width={22} />
            </span>
          </div>
        ) : (
          <span
            ref={iconRef}
            style={isDemo ? undefined : { rotate: `${tilt.toFixed(0)}deg` }}
            className={classNames(
              'tracker-accent flex items-center justify-center',
              // Every demo card uses the demo style: plain orange, lit and posed only while its scene moves.
              isDemo
                ? 'demo-icon-gesture text-background-20 fill-background-20'
                : classNames(
                    'transition-[rotate] duration-200',
                    isMoving
                      ? 'tracker-moving tracker-wiggle text-motion fill-motion'
                      : 'text-background-20 fill-background-20'
                  )
            )}
          >
            <BodyPartIcon bodyPart={tracker.info?.bodyPart} width={52} />
          </span>
        )}
        {/* One small toggle per card: the live 3D view or the body icon. Bottom right, so it fits beside
            the problem badges at every card width. */}
        <button
          type="button"
          aria-pressed={show3D}
          aria-label={show3D ? 'Show the body icon' : 'Show the live 3D view'}
          title={show3D ? 'Show the body icon' : 'Show the live 3D view'}
          onClick={toggle3D}
          className={classNames(
            'absolute bottom-2 right-2 z-10 rounded-[5px] border px-1.5 py-0.5 font-mono text-[11px] leading-none cursor-pointer',
            show3D
              ? 'border-transparent bg-accent-background-20 text-white'
              : 'border-background-10/[0.12] bg-background-80/70 text-background-30 hover:text-background-10'
          )}
        >
          3D
        </button>
      </div>

      <div className="flex flex-col gap-2 px-3 py-2.5">
        {/* One row at every width: the name takes the free space and truncates; signal stays on the right. */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2">
          <h3
            className="truncate font-mono text-[14px] font-semibold leading-snug text-background-10"
            title={trackerName}
          >
            {trackerName}
          </h3>
          <div className="flex items-center gap-1.5 whitespace-nowrap font-mono text-[12px] leading-none tnum">
            <SignalBars rssi={isDisconnected ? null : rssi} />
            <span
              title="Ping"
              className={classNames(
                'min-w-[4ch] text-right',
                ping != null && ping > HIGH_PING_MS
                  ? 'text-status-warning'
                  : 'text-background-20'
              )}
            >
              {ping != null && ping > 0 ? (
                <>
                  {ping}
                  <span className="card-ping-unit">ms</span>
                </>
              ) : (
                '--'
              )}
            </span>
          </div>
        </div>
        <BatteryBar
          pct={isDisconnected ? null : batteryPct}
          voltage={voltageText}
        />
      </div>
      {/* Motion rim: lit from the top centre, wider and further down the sides as --motion-level rises. */}
      <span
        aria-hidden="true"
        className="tracker-motion-rim"
        style={{ '--battery-low': batteryRedness(batteryPct) } as CSSProperties}
      />
    </div>
  );
}

/** Battery as a quiet outlined icon with a proportional fill and the % beside it; voltage is in the tooltip. */
export function BatteryBar({
  pct,
  voltage,
}: {
  pct?: number | null;
  voltage?: string | null;
}) {
  const level = batteryLevel(pct);
  const known = level != null;
  const [fill, text] =
    level == null
      ? ['', 'text-background-30']
      : level < LOW_BATTERY_PCT
        ? ['fill-status-critical', 'text-status-critical']
        : level <= 40
          ? ['fill-status-warning', 'text-status-warning']
          : ['fill-accent-background-30', 'text-background-10'];
  const label = known
    ? `Battery ${level}%${voltage ? ` · ${voltage}` : ''}`
    : 'Battery unknown';
  return (
    <div
      className="flex h-4 items-center justify-end gap-2 whitespace-nowrap"
      title={label}
      role="img"
      aria-label={label}
    >
      <div className="flex items-center gap-1.5">
        <svg
          aria-hidden="true"
          focusable="false"
          width="29"
          height="16"
          viewBox="0 0 30 16"
          className={known ? 'text-background-10' : 'text-background-30'}
        >
          <g opacity="0.65">
            <rect
              x="1"
              y="2"
              width="25"
              height="12"
              rx="3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M29 6V10"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
          {level != null && (
            <rect
              x="3"
              y="4"
              width={(level / 100) * 21}
              height="8"
              rx="1.5"
              className={fill}
            />
          )}
        </svg>
        <span
          className={classNames(
            'min-w-[4ch] text-right font-mono text-[12px] leading-none tnum',
            text
          )}
        >
          {known ? `${level}%` : '--'}
        </span>
      </div>
    </div>
  );
}

const LOW_BATTERY_PCT = 15;
const HIGH_PING_MS = 50;

/** Chips appear only for something the user should act on. Low battery shows in the battery bar instead, and
    offline as a dimmed card. */
function trackerProblems({
  isDisconnected,
  ping,
}: {
  isDisconnected: boolean;
  ping?: number | null;
}) {
  // Offline shows as a dimmed card, not a chip.
  if (isDisconnected) return [];
  const problems: { label: string; tone: string }[] = [];
  if (ping != null && ping > HIGH_PING_MS) {
    problems.push({
      label: 'High ping',
      tone: 'border-status-warning/30 text-status-warning',
    });
  }
  return problems;
}

/** Four signal bars from RSSI; the dBm value is in the tooltip. */
export function SignalBars({ rssi }: { rssi?: number | null }) {
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
  const { activePreset } = useTrackerPresets();
  const expected = activePreset?.targetCount ?? 5;
  const connected = useAtomValue(connectedIMUCountAtom);
  const bun = isPawTheme(config?.theme);
  const animate = config?.animations !== false;
  return (
    <section
      aria-labelledby="tracker-empty-title"
      className="tracker-empty-state relative isolate flex w-full flex-1 flex-col items-center justify-center overflow-hidden rounded-[14px] border border-[var(--material-border-subtle)] bg-background-70 px-6 py-10 text-center shadow-[inset_0_1px_0_0_rgba(250,249,245,0.04)] sm:py-12"
    >
      {/* Bun: the same drifting pixel clouds as the welcome tab. The logo hops every 4.2 s (see tracker-logo-hop). */}
      {bun && <ContourDots stirrable={false} />}
      <div className="relative flex h-14 w-14 items-center justify-center">
        {!bun && (
          <span
            aria-hidden="true"
            className="animate-search-pulse pointer-events-none absolute h-14 w-14 rounded-full border border-accent-background-20/40"
          />
        )}
        <span
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

      {/* No box: the dots stay visible around the text. A soft shadow in the panel colour keeps it readable. */}
      <div className="relative z-10 mt-5 flex flex-col items-center [text-shadow:0_0_6px_rgb(var(--background-70)),0_0_12px_rgb(var(--background-70))]">
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
        {/* One slot per expected tracker; each lights up as a tracker connects. */}
        <div
          className="mt-3 flex items-center gap-1.5"
          role="img"
          aria-label={`${connected} of ${expected} trackers connected`}
        >
          {Array.from({ length: expected }, (_, i) => (
            <span
              key={i}
              className={classNames(
                'h-2 w-2 rounded-full transition-colors duration-500',
                i < connected
                  ? 'bg-status-success'
                  : 'border border-background-10/[0.25]'
              )}
            />
          ))}
        </div>
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
          className="home-empty-action inline-flex h-8 items-center rounded-[12px] border border-[var(--material-border-primary)] px-3.5 text-ui-xs font-medium text-background-20 transition-colors hover:bg-background-10/[0.06] hover:text-background-10"
        >
          Assign trackers
        </NavLink>
        <button
          type="button"
          onClick={onSimulateDemo}
          className="home-empty-action inline-flex h-8 cursor-pointer items-center rounded-[12px] px-3 text-ui-xs font-medium text-background-20 transition-colors hover:bg-background-10/[0.08] hover:text-background-10"
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

function LiveTrackerCard({
  trackerKey,
  onClick,
}: {
  trackerKey: string;
  onClick: (tracker: TrackerDataT) => void;
}) {
  const live = useAtomValue(liveTrackerAtom(trackerKey));
  if (!live) return null;
  return (
    <ClaudeTrackerWindowCard
      tracker={live.tracker}
      device={live.device}
      onClick={() => onClick(live.tracker)}
    />
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
  // The grid follows the tracker set only; each card subscribes to its own live data.
  const assignedTrackers = useAtomValue(assignedTrackerSetAtom);
  const unassignedTrackers = useAtomValue(unassignedTrackerSetAtom);
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

  const sendToSettings = (tracker: TrackerDataT) =>
    navigate(
      `/tracker/${tracker.trackerId?.trackerNum}/${tracker.trackerId?.deviceId?.id}`
    );

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
          // Empty: the same inset on all four sides, so the card fills the panel evenly.
          allTrackers.length === 0 ? 'p-4' : 'py-10 sm:py-14 px-6'
        )}
      >
        <div
          className={classNames(
            'w-full max-w-[980px] flex flex-col items-center',
            allTrackers.length === 0 && 'min-h-0 flex-1'
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
              // Always two columns, whatever the zoom; the rows grow with the tracker count.
              className="grid w-full max-w-[980px] grid-cols-2 gap-3"
            >
              {allTrackers.map((item, idx) => {
                const { tracker, device } = item;
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
                    <LiveTrackerCard
                      trackerKey={trackerKey(item)}
                      onClick={sendToSettings}
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
    </div>
  );
}

import type {
  StreamCastAudio,
  StreamCastLinkReply,
  StreamCastStatus,
} from '@shared/electron-api';
import type { StatusTone } from '@/components/commons/StatusDot';

export type RemoteLink = StreamCastLinkReply['link'] | 'checking';

export type RemoteState = {
  link: RemoteLink;
  /** The last status StreamCast sent. While `stale`, it is history, not the present. */
  status: StreamCastStatus | null;
  stale: boolean;
  appVersion: string | null;
  detail: string | null;
  companionProtocol: number | null;
};

export const INITIAL_REMOTE_STATE: RemoteState = {
  link: 'checking',
  status: null,
  stale: false,
  appVersion: null,
  detail: null,
  companionProtocol: null,
};

// Only a closed app takes the last status away. A lost control connection says nothing about
// the stream, so the last known state stays on screen, marked as unconfirmed.
export function applyReply(
  previous: RemoteState,
  reply: StreamCastLinkReply
): RemoteState {
  switch (reply.link) {
    case 'connected':
      return {
        ...INITIAL_REMOTE_STATE,
        link: 'connected',
        status: reply.status,
        appVersion: reply.appVersion,
      };
    case 'unresponsive':
      return {
        ...previous,
        link: 'unresponsive',
        stale: previous.status !== null,
        detail: reply.detail,
      };
    case 'incompatible':
      return {
        ...INITIAL_REMOTE_STATE,
        link: 'incompatible',
        companionProtocol: reply.companionProtocol,
      };
    default:
      return { ...INITIAL_REMOTE_STATE, link: reply.link };
  }
}

export type LinkLine = { tone: StatusTone; label: string; detail?: string };

export function describeLink(state: RemoteState, supportedProtocol: number): LinkLine {
  switch (state.link) {
    case 'checking':
      return { tone: 'idle', label: 'Checking…' };
    case 'connected':
      return { tone: 'ok', label: 'Connected' };
    case 'notRunning':
      return {
        tone: 'idle',
        label: 'Not running',
        detail: 'Open Quest StreamCast to control streaming from here.',
      };
    case 'noBridge':
      return {
        tone: 'warn',
        label: 'Update needed',
        detail:
          'This copy of Quest StreamCast is too old to be controlled from here. It keeps working on its own. Quit it and open a newer build, or use Locate app to choose one.',
      };
    case 'incompatible':
      return {
        tone: 'warn',
        label: 'Update needed',
        detail:
          (state.companionProtocol ?? 0) > supportedProtocol
            ? 'Quest StreamCast is newer than this Bun Tracker. Update Bun Tracker to control it from here.'
            : 'This copy of Quest StreamCast is too old to be controlled from here. It keeps working on its own. Update it, or use Locate app to choose a newer build.',
      };
    case 'unresponsive':
      return {
        tone: 'critical',
        label: 'Connection lost',
        detail: state.stale
          ? 'Quest StreamCast is not answering. Any stream it was running may still be running; what you see below is the last known state.'
          : 'Quest StreamCast is not answering. Check the app, then reconnect.',
      };
  }
}

export function describeSession(status: StreamCastStatus): LinkLine {
  const { session, recovery } = status;
  const device = status.devices.find((d) => d.serial === status.selectedSerial);
  if (!status.ready) return { tone: 'idle', label: 'Starting up…' };
  switch (session.phase) {
    case 'streaming':
      if (session.mode === 'synthetic')
        return {
          tone: 'warn',
          label: 'Test session running',
          detail: 'The synthetic backend is on. No headset data is flowing.',
        };
      if (session.mode === 'upstream')
        return {
          tone: 'ok',
          label: 'Streaming in the scrcpy window',
          detail: 'Audio status needs the native engine.',
        };
      return { tone: 'ok', label: 'Streaming' };
    case 'connecting':
      return { tone: 'warn', label: 'Starting…' };
    case 'stopping':
      return { tone: 'idle', label: 'Stopping…' };
    case 'recovering':
      return {
        tone: 'warn',
        label: 'Reconnecting over Wi-Fi…',
        detail: recovery
          ? `Attempt ${recovery.attempt} of ${recovery.maxAttempts}. ${recovery.problem}`
          : undefined,
      };
    case 'discovering':
      return { tone: 'idle', label: 'Looking for headsets…' };
    case 'authorizing':
      return {
        tone: 'warn',
        label: 'Waiting for approval on the headset',
        detail: session.problem,
      };
    case 'failed':
      return {
        tone: 'critical',
        label: 'Needs attention',
        detail: session.problem,
      };
    case 'disconnected':
      return device
        ? { tone: 'idle', label: 'Ready to stream' }
        : { tone: 'idle', label: 'No headset', detail: session.problem };
  }
}

const AUDIO_LINES: Record<
  StreamCastAudio['state'],
  { tone: StatusTone; label: string }
> = {
  off: { tone: 'idle', label: 'Off' },
  waiting: { tone: 'idle', label: 'Waiting for stream' },
  connecting: { tone: 'warn', label: 'Connecting…' },
  live: { tone: 'ok', label: 'Live' },
  refused: { tone: 'warn', label: 'Refused by headset' },
  failed: { tone: 'critical', label: 'Error' },
};

export function describeAudio(audio: StreamCastAudio): LinkLine {
  return { ...AUDIO_LINES[audio.state], detail: audio.detail };
}

export type DeviceChoice = { value: string; label: string };

const STATE_WORDS: Record<string, string> = {
  ready: '',
  unauthorized: ' (needs approval)',
  offline: ' (offline)',
};

export function deviceLabel(device: StreamCastStatus['devices'][number]) {
  const transport = device.transport === 'usb' ? 'USB' : 'Wi-Fi';
  const state = STATE_WORDS[device.state] ?? ` (${device.state})`;
  return `${device.name} · ${transport}${state}`;
}

// Actions that could only be refused, or that would act on an unconfirmed state, are withheld.
export function availableActions(state: RemoteState) {
  const session = state.link === 'connected' ? state.status?.session : null;
  return {
    start: session?.canStart ?? false,
    stop: session?.canStop ?? false,
    refresh: session?.canRefresh ?? false,
    reconnectWifi: session?.canReconnectWifi ?? false,
    selectHeadset: !!session && !session.active,
    chooseOutput: !!session,
  };
}

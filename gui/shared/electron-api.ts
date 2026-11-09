// Contract for window.electronAPI. The name is kept for compatibility: the Tauri shell
// (gui/tauri/shim/electron-shim.js) injects an object with this shape.
// Methods the shell does not implement are optional or are no-ops there.

export type OpenDialogOptions = {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
  properties?: ('openFile' | 'openDirectory' | 'multiSelections')[];
};

export type OpenDialogReturnValue = {
  canceled: boolean;
  filePaths: string[];
};

export type SaveDialogOptions = {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
};

export type SaveDialogReturnValue = {
  canceled: boolean;
  filePath: string;
};

export type ServerStatusEvent = {
  type: 'stdout' | 'stderr' | 'error' | 'terminated' | 'other';
  message: string;
};

export type OSStats = {
  type: 'linux' | 'windows' | 'macos' | 'unknown';
};

export interface CrossStorage {
  set(key: string, value: unknown): Promise<void>;
  get<T>(key: string): Promise<T | undefined>;
  delete(key: string): Promise<boolean>;
  save(): Promise<boolean>;
}

export type GHGet = { type: 'fw-releases' } | { type: 'asset'; url: string };
export type GHReturn = {
  asset: [number, string][] | null;
  ['fw-releases']:
    | {
        assets: { browser_download_url: string; name: string; digest: string }[];
        prerelease: boolean;
        tag_name: string;
        body: string;
      }[]
    | null;
};

export type DiscordPresence =
  | { enable: false }
  | { enable: true; activity: string; iconText: string | undefined };

// Quest StreamCast control bridge: the Remote page drives the native app, which owns capture.
// The status fields are StreamCast's wire format (ControlStatus in its StreamCastCore package).
export type StreamCastPhase =
  | 'disconnected'
  | 'discovering'
  | 'authorizing'
  | 'connecting'
  | 'streaming'
  | 'stopping'
  | 'recovering'
  | 'failed';

export type StreamCastDevice = {
  serial: string;
  name: string;
  transport: 'usb' | 'wifi';
  /** `ready`, `unauthorized`, `offline`, or adb's own word for anything else. */
  state: string;
  isHeadset: boolean;
};

export type StreamCastOutput = {
  /** Absent means the system default output. */
  uid?: string;
  name: string;
};

export type StreamCastAudioState =
  | 'off'
  | 'waiting'
  | 'connecting'
  | 'live'
  | 'refused'
  | 'failed';

export type StreamCastAudio = {
  enabled: boolean;
  state: StreamCastAudioState;
  detail: string;
  output: StreamCastOutput;
  outputs: StreamCastOutput[];
  latency: string;
  counters?: string;
};

export type StreamCastStatus = {
  ready: boolean;
  session: {
    phase: StreamCastPhase;
    mode?: 'native' | 'upstream' | 'synthetic';
    problem?: string;
    active: boolean;
    canStart: boolean;
    canStop: boolean;
    canRefresh: boolean;
    canReconnectWifi: boolean;
  };
  devices: StreamCastDevice[];
  selectedSerial?: string;
  connection?: 'usb' | 'wifi';
  wirelessProblem?: string;
  recovery?: { attempt: number; maxAttempts: number; problem: string };
  preset: string;
  game: StreamCastAudio;
  mic: StreamCastAudio;
  video?: {
    width: number;
    height: number;
    fps: number;
    mbps: number;
    decoder: string;
  };
  recording: boolean;
  engine: string;
  synthetic: boolean;
  settingsIssue?: string;
  events: { at: number; message: string }[];
};

/** A reply from the shell. Only `connected` says anything about the stream. */
export type StreamCastLinkReply =
  | {
      link: 'connected';
      appVersion: string;
      status: StreamCastStatus;
      /** Why a command was refused; the status is still current. */
      refused: string | null;
    }
  | { link: 'notRunning' }
  /** Running, but a build from before this bridge. */
  | { link: 'noBridge' }
  | { link: 'unresponsive'; detail: string }
  | { link: 'incompatible'; companionProtocol: number | null };

export type StreamCastCommand =
  | { command: 'refresh' | 'reconnectWifi' | 'start' | 'stop' }
  | { command: 'select'; serial: string }
  | { command: 'setGameOutput' | 'setMicOutput'; uid: string | null };

export type StreamCastOpenResult = {
  result: 'opened' | 'missing' | 'failed' | 'canceled' | 'wrongApp';
};

export interface StreamCastApi {
  status: () => Promise<StreamCastLinkReply>;
  command: (command: StreamCastCommand) => Promise<StreamCastLinkReply>;
  /** Launches the app or brings the running copy forward. Never starts a stream. */
  open: () => Promise<StreamCastOpenResult>;
  /** Asks the user where the app is, remembers it, and opens it. */
  locate: () => Promise<StreamCastOpenResult>;
}

export interface IElectronAPI {
  onServerStatus: (cb: (data: ServerStatusEvent) => void) => () => void;
  openUrl: (url: string) => Promise<void>;
  osStats: () => Promise<OSStats>;
  openLogsFolder: () => Promise<void>;
  openConfigFolder: () => Promise<void>;
  close: () => void;
  hide: () => void;
  minimize: () => void;
  toggleMaximize: () => void;
  showDecorations: (decorations: boolean) => void;
  setTranslations: (translations: Record<string, string>) => void;
  i18nOverride: () => Promise<string | false>;
  getStorage: (type: 'settings' | 'cache') => Promise<CrossStorage>;
  openDialog: (options: OpenDialogOptions) => Promise<OpenDialogReturnValue>;
  saveDialog: (options: SaveDialogOptions) => Promise<SaveDialogReturnValue>;
  log: (type: 'info' | 'error' | 'warn', ...args: unknown[]) => void;
  openFile: (path: string) => void;
  ghGet: <T extends GHGet>(options: T) => Promise<GHReturn[T['type']]>;
  setPresence: (options: DiscordPresence) => void;
  getInstallDir: () => Promise<string>;
  isSteam: () => Promise<boolean>;
  /** Spike only: stops the server and starts it again. */
  restartServer?: () => Promise<void>;
  /** Spike only: starts the ESP32 dongle bridge; resolves to the serial port it uses. */
  startDongleBridge?: () => Promise<string>;
  getAppleMusic?: () => Promise<{
    running: boolean;
    playing: boolean;
    track?: string;
    artist?: string;
    album?: string;
    pos?: number;
    dur?: number;
    formatted?: string;
  }>;
  onTrayReset?: (cb: (type: string) => void) => () => void;
  onTrayElevationStep?: (cb: (delta: number) => void) => () => void;
  onTrayElevationReset?: (cb: () => void) => () => void;
  /** Tauri shell: control bridge to the Quest StreamCast app. */
  streamCast?: StreamCastApi;
  requestMicrophoneAccess?: () => Promise<boolean>;
  /** Tauri shell (macOS): recording-capable audio devices, including virtual ones. */
  audioInputs?: () => Promise<{ uid: string; name: string; isDefault: boolean }[]>;
  /** Makes the device with this CoreAudio UID the Mac's default input. */
  setAudioInput?: (uid: string) => Promise<void>;
  transcribeNativeSpeech?: (data: {
    audioBase64: string;
    language?: string;
  }) => Promise<{ success: boolean; text?: string; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

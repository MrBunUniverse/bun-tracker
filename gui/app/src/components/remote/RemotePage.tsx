import { useId } from 'react';
import classNames from 'classnames';
import { Button } from '@/components/commons/Button';
import { StatusDot } from '@/components/commons/StatusDot';
import { useStreamCast } from '@/hooks/streamcast';
import type { StreamCastAudio, StreamCastStatus } from '@shared/electron-api';
import {
  availableActions,
  describeAudio,
  describeLink,
  describeSession,
  deviceLabel,
  LinkLine,
  RemoteState,
} from './streamcast-model';

// The protocol this build speaks (PROTOCOL in gui/tauri/src/streamcast.rs).
const SUPPORTED_PROTOCOL = 1;

const CARD =
  'remote-card rounded-[14px] border border-background-10/[0.06] bg-background-70 p-3';
const FIELD =
  'w-full min-w-0 rounded-lg border border-background-10/[0.08] bg-background-80 px-2 py-1.5 text-ui-xs text-background-10 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-30/40';

function Status({ line }: { line: LinkLine }) {
  return (
    <StatusDot
      tone={line.tone}
      label={line.label}
      className="text-ui-xs font-medium text-background-10"
    />
  );
}

function AudioCard({
  title,
  audio,
  disabled,
  onOutput,
}: {
  title: string;
  audio: StreamCastAudio;
  disabled: boolean;
  onOutput: (uid: string | null) => void;
}) {
  const selectId = useId();
  const line = describeAudio(audio);
  return (
    <section className={classNames(CARD, 'flex flex-col gap-2')}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-ui-xs font-semibold text-background-10">{title}</h2>
        <Status line={line} />
      </div>
      <p
        className={classNames(
          'text-ui-2xs leading-snug',
          audio.state === 'failed'
            ? 'text-status-critical'
            : 'text-background-20'
        )}
      >
        {line.detail}
      </p>
      {audio.enabled && (
        <div className="flex flex-col gap-1">
          <label htmlFor={selectId} className="text-ui-2xs text-background-30">
            Output
          </label>
          <select
            id={selectId}
            className={FIELD}
            value={audio.output.uid ?? ''}
            disabled={disabled}
            onChange={(event) => onOutput(event.target.value || null)}
          >
            {audio.outputs.map((output) => (
              <option key={output.uid ?? ''} value={output.uid ?? ''}>
                {output.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </section>
  );
}

function Diagnostics({
  status,
  appVersion,
}: {
  status: StreamCastStatus;
  appVersion: string | null;
}) {
  const rows: [string, string | undefined][] = [
    ['StreamCast', appVersion ?? undefined],
    ['Engine', status.engine],
    ['Recording', status.recording ? 'On' : 'Off'],
    [
      'Video',
      status.video &&
        `${status.video.width}×${status.video.height} · ${status.video.fps.toFixed(0)} fps · ${status.video.mbps.toFixed(1)} Mbps · ${status.video.decoder}`,
    ],
    ['Game latency', status.game.latency],
    ['Game audio', status.game.counters],
    ['Mic latency', status.mic.latency],
    ['Microphone', status.mic.counters],
    ['Wi-Fi', status.wirelessProblem],
    ['Settings', status.settingsIssue],
  ];
  return (
    <details className={classNames(CARD, 'text-ui-2xs text-background-20')}>
      <summary className="cursor-pointer select-none rounded text-ui-xs font-semibold text-background-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-30/40">
        Diagnostics
      </summary>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        {rows.map(
          ([label, value]) =>
            value && (
              <div key={label} className="contents">
                <dt className="text-background-30">{label}</dt>
                <dd>{value}</dd>
              </div>
            )
        )}
      </dl>
      {status.events.length > 0 && (
        <ol className="mt-2 flex flex-col gap-0.5 border-t border-background-10/[0.06] pt-2">
          {[...status.events].reverse().map((event) => (
            <li key={`${event.at}-${event.message}`}>
              <time className="text-background-30">
                {new Date(event.at * 1000).toLocaleTimeString()}
              </time>{' '}
              {event.message}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

function ConnectionHeader({
  state,
  appMissing,
  pending,
  actions,
  onOpen,
  onLocate,
  onReconnectControl,
  onReconnectWifi,
}: {
  state: RemoteState;
  appMissing: boolean;
  pending: string | null;
  actions: ReturnType<typeof availableActions>;
  onOpen: () => void;
  onLocate: () => void;
  onReconnectControl: () => void;
  onReconnectWifi: () => void;
}) {
  const line: LinkLine = appMissing
    ? {
        tone: 'warn',
        label: 'App not found',
        detail:
          'macOS could not find Quest StreamCast. Choose where it is, and Bun Tracker will remember it.',
      }
    : describeLink(state, SUPPORTED_PROTOCOL);
  const closed = state.link === 'notRunning';
  const outdated = state.link === 'noBridge' || state.link === 'incompatible';
  return (
    <header className={classNames(CARD, 'flex flex-col gap-2')}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="text-ui-sm font-semibold text-background-10">
            Quest StreamCast
          </h1>
          <Status line={line} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {!appMissing && closed && (
            <Button
              variant="primary"
              loading={pending === 'open'}
              disabled={pending !== null}
              onClick={onOpen}
            >
              Open Quest StreamCast
            </Button>
          )}
          {!appMissing && !closed && state.link !== 'checking' && (
            <Button
              variant="secondary"
              loading={pending === 'open'}
              disabled={pending !== null}
              onClick={onOpen}
            >
              Show app
            </Button>
          )}
          {state.link === 'unresponsive' && (
            <Button variant="secondary" onClick={onReconnectControl}>
              Reconnect
            </Button>
          )}
          {actions.reconnectWifi && (
            <Button
              variant="secondary"
              loading={pending === 'reconnectWifi'}
              disabled={pending !== null}
              onClick={onReconnectWifi}
            >
              Reconnect Wi-Fi
            </Button>
          )}
          {(appMissing || outdated) && (
            <Button
              variant={appMissing ? 'primary' : 'secondary'}
              loading={pending === 'locate'}
              disabled={pending !== null}
              onClick={onLocate}
            >
              Locate app
            </Button>
          )}
        </div>
      </div>
      {line.detail && (
        <p
          role="status"
          className="text-ui-2xs leading-snug text-background-20"
        >
          {line.detail}
        </p>
      )}
    </header>
  );
}

function HeadsetRow({
  status,
  canSelect,
  canRefresh,
  refreshing,
  onSelect,
  onRefresh,
}: {
  status: StreamCastStatus;
  canSelect: boolean;
  canRefresh: boolean;
  refreshing: boolean;
  onSelect: (serial: string) => void;
  onRefresh: () => void;
}) {
  const selectId = useId();
  const selected = status.devices.find(
    (device) => device.serial === status.selectedSerial
  );
  return (
    <section className={classNames(CARD, 'flex flex-col gap-2')}>
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 grow flex-col gap-1">
          <label htmlFor={selectId} className="text-ui-2xs text-background-30">
            Headset
          </label>
          <select
            id={selectId}
            className={FIELD}
            value={status.selectedSerial ?? ''}
            disabled={!canSelect || status.devices.length === 0}
            onChange={(event) => onSelect(event.target.value)}
          >
            {!selected && (
              <option value="" disabled>
                {status.devices.length ? 'Choose a headset' : 'None found'}
              </option>
            )}
            {status.devices.map((device) => (
              <option key={device.serial} value={device.serial}>
                {deviceLabel(device)}
              </option>
            ))}
          </select>
        </div>
        <Button
          variant="secondary"
          loading={refreshing}
          disabled={!canRefresh}
          onClick={onRefresh}
        >
          Refresh
        </Button>
      </div>
      <p className="text-ui-2xs text-background-20">
        Preset: {status.preset}. Change it in Quest StreamCast with Show app.
      </p>
    </section>
  );
}

export function RemotePage({ embedded = false }: { embedded?: boolean }) {
  const {
    available,
    state,
    notice,
    appMissing,
    pending,
    send,
    open,
    locate,
    reconnect,
  } = useStreamCast();
  const { status } = state;
  const actions = availableActions(state);
  const session = status && describeSession(status);

  return (
    <div
      className="remote-page relative w-full min-h-0"
      style={embedded ? undefined : { height: 'calc(100vh - 146px)' }}
    >
      <div
        className={
          embedded
            ? undefined
            : 'absolute inset-0 overflow-y-auto overscroll-contain p-2 pb-16 sm:p-3'
        }
      >
        <div className="remote-panel flex flex-col gap-2">
          {!available ? (
            <div className={CARD}>
              <h1 className="text-ui-sm font-semibold text-background-10">
                Quest StreamCast
              </h1>
              <p className="mt-1 text-ui-2xs text-background-20">
                This Bun Tracker window can't reach Quest StreamCast yet.
                Restart Bun Tracker from the launcher to load the bridge.
              </p>
            </div>
          ) : (
            <>
              <ConnectionHeader
                state={state}
                appMissing={appMissing}
                pending={pending}
                actions={actions}
                onOpen={open}
                onLocate={locate}
                onReconnectControl={reconnect}
                onReconnectWifi={() => send({ command: 'reconnectWifi' })}
              />
              {notice && (
                <p
                  role="alert"
                  className="rounded-lg border border-background-10/[0.08] px-3 py-2 text-ui-2xs text-status-critical"
                >
                  {notice}
                </p>
              )}
              {status && session && (
                <>
                  <HeadsetRow
                    status={status}
                    canSelect={actions.selectHeadset && pending === null}
                    canRefresh={actions.refresh && pending === null}
                    refreshing={pending === 'refresh'}
                    onSelect={(serial) => send({ command: 'select', serial })}
                    onRefresh={() => send({ command: 'refresh' })}
                  />
                  <section className={classNames(CARD, 'flex flex-col gap-2')}>
                    <div className="flex items-center justify-between gap-3">
                      <div role="status" className="min-w-0">
                        {state.stale ? (
                          <StatusDot
                            tone="warn"
                            label={`Last known: ${session.label}`}
                            className="text-ui-xs font-medium text-background-10"
                          />
                        ) : (
                          <Status line={session} />
                        )}
                      </div>
                      {status.session.active ? (
                        <Button
                          variant="secondary"
                          loading={pending === 'stop'}
                          disabled={!actions.stop || pending !== null}
                          onClick={() => send({ command: 'stop' })}
                        >
                          Stop streaming
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          loading={pending === 'start'}
                          disabled={!actions.start || pending !== null}
                          onClick={() => send({ command: 'start' })}
                        >
                          Start streaming
                        </Button>
                      )}
                    </div>
                    {session.detail && (
                      <p className="text-ui-2xs leading-snug text-background-20">
                        {session.detail}
                      </p>
                    )}
                  </section>
                  <div className="remote-audio-grid">
                    <AudioCard
                      title="Game audio"
                      audio={status.game}
                      disabled={!actions.chooseOutput || pending !== null}
                      onOutput={(uid) =>
                        send({ command: 'setGameOutput', uid })
                      }
                    />
                    <AudioCard
                      title="Microphone"
                      audio={status.mic}
                      disabled={!actions.chooseOutput || pending !== null}
                      onOutput={(uid) => send({ command: 'setMicOutput', uid })}
                    />
                  </div>
                  <Diagnostics status={status} appVersion={state.appVersion} />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

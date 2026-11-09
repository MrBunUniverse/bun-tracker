import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_REMOTE_STATE,
  applyReply,
  availableActions,
  describeAudio,
  describeLink,
  describeSession,
  deviceLabel,
} from '../src/components/remote/streamcast-model.ts';
import type {
  StreamCastAudio,
  StreamCastStatus,
} from '../../shared/electron-api.ts';

const audio = (over: Partial<StreamCastAudio> = {}): StreamCastAudio => ({
  enabled: true,
  state: 'waiting',
  detail: 'Starts with a native session',
  output: { name: 'System default' },
  outputs: [{ name: 'System default' }],
  latency: 'Balanced (120 ms)',
  ...over,
});

const status = (
  session: Partial<StreamCastStatus['session']> = {},
  over: Partial<StreamCastStatus> = {}
): StreamCastStatus => ({
  ready: true,
  session: {
    phase: 'disconnected',
    active: false,
    canStart: true,
    canStop: false,
    canRefresh: true,
    canReconnectWifi: false,
    ...session,
  },
  devices: [
    {
      serial: 'A',
      name: 'Quest 3S',
      transport: 'usb',
      state: 'ready',
      isHeadset: true,
    },
  ],
  selectedSerial: 'A',
  connection: 'usb',
  preset: '1280 px · 30 fps · H.264 · Both eyes',
  game: audio(),
  mic: audio(),
  recording: false,
  engine: 'Native',
  synthetic: false,
  events: [],
  ...over,
});

const connected = (s: StreamCastStatus) =>
  applyReply(INITIAL_REMOTE_STATE, {
    link: 'connected',
    appVersion: '0.3.0 (1)',
    status: s,
    refused: null,
  });

const streaming = status({
  phase: 'streaming',
  mode: 'native',
  active: true,
  canStart: false,
  canStop: true,
  canRefresh: false,
});

test('losing the control connection keeps the stream as last known, not stopped', () => {
  const lost = applyReply(connected(streaming), {
    link: 'unresponsive',
    detail: 'timed out',
  });
  assert.equal(lost.status?.session.phase, 'streaming');
  assert.equal(lost.stale, true);
  const line = describeLink(lost, 1);
  assert.equal(line.label, 'Connection lost');
  assert.match(line.detail ?? '', /may still be running/);
  assert.doesNotMatch(line.detail ?? '', /stopped/i);
});

test('nothing can be commanded from a stale state', () => {
  const lost = applyReply(connected(streaming), {
    link: 'unresponsive',
    detail: 'timed out',
  });
  assert.deepEqual(availableActions(lost), {
    start: false,
    stop: false,
    refresh: false,
    reconnectWifi: false,
    selectHeadset: false,
    chooseOutput: false,
  });
});

test('reconnecting replaces the stale state with the real one', () => {
  const lost = applyReply(connected(streaming), {
    link: 'unresponsive',
    detail: 'timed out',
  });
  const back = applyReply(lost, {
    link: 'connected',
    appVersion: '0.3.0 (1)',
    status: streaming,
    refused: null,
  });
  assert.equal(back.stale, false);
  assert.equal(back.detail, null);
});

test('a closed app clears the last status, since its stream went with it', () => {
  const closed = applyReply(connected(streaming), { link: 'notRunning' });
  assert.equal(closed.status, null);
  assert.equal(closed.stale, false);
  assert.equal(describeLink(closed, 1).label, 'Not running');
});

test('an unresponsive app with no earlier status does not invent one', () => {
  const state = applyReply(INITIAL_REMOTE_STATE, {
    link: 'unresponsive',
    detail: 'timed out',
  });
  assert.equal(state.status, null);
  assert.equal(state.stale, false);
  assert.doesNotMatch(describeLink(state, 1).detail ?? '', /last known/);
});

test('older and newer companions name the side that needs updating', () => {
  const older = applyReply(INITIAL_REMOTE_STATE, {
    link: 'incompatible',
    companionProtocol: 0,
  });
  const newer = applyReply(INITIAL_REMOTE_STATE, {
    link: 'incompatible',
    companionProtocol: 2,
  });
  const unknown = applyReply(INITIAL_REMOTE_STATE, {
    link: 'incompatible',
    companionProtocol: null,
  });
  assert.match(describeLink(older, 1).detail ?? '', /too old/);
  assert.match(describeLink(newer, 1).detail ?? '', /Update Bun Tracker/);
  assert.match(describeLink(unknown, 1).detail ?? '', /too old/);
  const bridgeless = applyReply(INITIAL_REMOTE_STATE, { link: 'noBridge' });
  assert.match(describeLink(bridgeless, 1).detail ?? '', /keeps working/);
});

test('actions follow what StreamCast says it can do right now', () => {
  const idle = availableActions(connected(status()));
  assert.equal(idle.start, true);
  assert.equal(idle.stop, false);
  assert.equal(idle.selectHeadset, true);
  const live = availableActions(connected(streaming));
  assert.equal(live.start, false);
  assert.equal(live.stop, true);
  assert.equal(live.refresh, false);
  assert.equal(live.selectHeadset, false, 'no headset switch during a session');
  assert.equal(live.chooseOutput, true);
});

test('session lines cover the states the page must explain', () => {
  const line = (s: Parameters<typeof status>[0], o?: Partial<StreamCastStatus>) =>
    describeSession(status(s, o));
  assert.equal(line({}).label, 'Ready to stream');
  assert.equal(line({}, { selectedSerial: undefined }).label, 'No headset');
  assert.equal(line({ phase: 'connecting' }).label, 'Starting…');
  assert.equal(line({ phase: 'stopping' }).label, 'Stopping…');
  assert.equal(line({}, { ready: false }).label, 'Starting up…');
  const failed = line({ phase: 'failed', problem: 'Check the cable.' });
  assert.equal(failed.tone, 'critical');
  assert.equal(failed.detail, 'Check the cable.');
  const lost = line(
    { phase: 'recovering' },
    { recovery: { attempt: 2, maxAttempts: 5, problem: 'no answer' } }
  );
  assert.equal(lost.detail, 'Attempt 2 of 5. no answer');
  const fake = line({ phase: 'streaming', mode: 'synthetic' });
  assert.equal(fake.tone, 'warn', 'a test session never reads as live');
});

test('game audio and microphone are described separately', () => {
  const s = status(
    {},
    {
      game: audio({ state: 'live', detail: 'Playing to Speakers' }),
      mic: audio({ state: 'failed', detail: 'Stopped: no server' }),
    }
  );
  assert.equal(describeAudio(s.game).tone, 'ok');
  assert.equal(describeAudio(s.mic).tone, 'critical');
  assert.equal(describeAudio(s.mic).detail, 'Stopped: no server');
  assert.equal(describeAudio(audio({ state: 'refused' })).tone, 'warn');
});

test('headset labels show the link and any problem', () => {
  const device = status().devices[0];
  assert.equal(deviceLabel(device), 'Quest 3S · USB');
  assert.equal(
    deviceLabel({ ...device, transport: 'wifi', state: 'offline' }),
    'Quest 3S · Wi-Fi (offline)'
  );
  assert.equal(
    deviceLabel({ ...device, state: 'recovery' }),
    'Quest 3S · USB (recovery)'
  );
});

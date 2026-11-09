import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  StreamCastCommand,
  StreamCastLinkReply,
  StreamCastOpenResult,
} from '@shared/electron-api';
import { useElectron } from './electron';
import {
  applyReply,
  INITIAL_REMOTE_STATE,
  RemoteState,
} from '@/components/remote/streamcast-model';

const POLL_CONNECTED_MS = 1000;
const POLL_IDLE_MS = 2500;
// A launched app needs a moment before its socket answers.
const POLL_AFTER_OPEN_MS = 400;

// Reads StreamCast's status while the Remote page is open. Leaving the page only stops this
// polling; it sends nothing to StreamCast, so a running stream keeps running.
export function useStreamCast() {
  const electron = useElectron();
  const api = electron.isElectron ? electron.api.streamCast : undefined;
  const [state, setState] = useState<RemoteState>(INITIAL_REMOTE_STATE);
  const [notice, setNotice] = useState<string | null>(null);
  const [appMissing, setAppMissing] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const requested = useRef(0);
  const applied = useRef(0);
  const poll = useRef<() => void>(() => {});

  // A slow status reply must not overwrite a command result that started after it.
  const accept = useCallback((reply: StreamCastLinkReply, id: number) => {
    if (id < applied.current) return;
    applied.current = id;
    setState((previous) => applyReply(previous, reply));
    if (reply.link === 'connected') {
      setAppMissing(false);
      // Stays until the next action: the polls that follow have nothing to say about it.
      if (reply.refused) setNotice(reply.refused);
    }
  }, []);

  useEffect(() => {
    if (!api) return;
    let alive = true;
    const schedule = (delay: number) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => poll.current(), delay);
    };
    poll.current = async () => {
      clearTimeout(timer.current);
      const id = ++requested.current;
      let delay = POLL_IDLE_MS;
      try {
        const reply = await api.status();
        if (!alive) return;
        accept(reply, id);
        if (reply.link === 'connected') delay = POLL_CONNECTED_MS;
      } catch (error) {
        if (!alive) return;
        accept({ link: 'unresponsive', detail: String(error) }, id);
      }
      schedule(delay);
    };
    poll.current();
    return () => {
      alive = false;
      clearTimeout(timer.current);
      poll.current = () => {};
    };
  }, [api, accept]);

  const act = useCallback(async (name: string, work: () => Promise<void>) => {
    setPending(name);
    setNotice(null);
    try {
      await work();
    } catch (error) {
      setNotice(String(error));
    } finally {
      setPending(null);
    }
  }, []);

  const send = useCallback(
    (command: StreamCastCommand) =>
      act(command.command, async () => {
        if (!api) return;
        const id = ++requested.current;
        accept(await api.command(command), id);
      }),
    [act, accept, api]
  );

  const afterOpen = useCallback((opened: StreamCastOpenResult) => {
    if (opened.result === 'opened') {
      setAppMissing(false);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => poll.current(), POLL_AFTER_OPEN_MS);
    } else if (opened.result === 'missing') {
      setAppMissing(true);
    } else if (opened.result === 'wrongApp') {
      setNotice('That app is not Quest StreamCast.');
    } else if (opened.result === 'failed') {
      setNotice('macOS did not open Quest StreamCast. Try again.');
    }
  }, []);

  const open = useCallback(
    () =>
      act('open', async () => {
        if (api) afterOpen(await api.open());
      }),
    [act, afterOpen, api]
  );

  const locate = useCallback(
    () =>
      act('locate', async () => {
        if (api) afterOpen(await api.locate());
      }),
    [act, afterOpen, api]
  );

  const reconnect = useCallback(() => poll.current(), []);

  return {
    available: !!api,
    state,
    notice,
    appMissing,
    pending,
    send,
    open,
    locate,
    reconnect,
  };
}

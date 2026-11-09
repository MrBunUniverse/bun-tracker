import { useLocalization } from '@fluent/react';
import classNames from 'classnames';
import {
  CSSProperties,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { IconButton } from '@/components/commons/IconButton';
import { moveFocus } from './move-focus';
import {
  RestartState,
  restartClick,
  restartStepTimeoutMs,
} from './server-restart';

const EDGE = 12;
const GAP = 8;
const MENU_WIDTH = 248;

const NO_DRAG = { WebkitAppRegion: 'no-drag' } as any;
const ITEM_CLASS =
  'flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-[10px] px-3 py-2 text-left text-ui-xs font-medium text-background-10 hover:bg-background-10/[0.06] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20';
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-20';

function DotsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

/**
 * The top bar's one slot for occasional app actions: reload the interface and restart the server.
 * The restart asks for a second click, and the item shows progress and errors inline.
 */
export function AppActionsMenu() {
  const { l10n } = useLocalization();
  const restart = window.electronAPI?.restartServer;
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>();
  const [reloading, setReloading] = useState(false);
  const [restartState, setRestartState] = useState<RestartState>('idle');
  const [error, setError] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const menuLabel = l10n.getString('topbar-app-actions', null, 'App actions');

  const menuItems = () =>
    Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not(:disabled)'
      ) ?? []
    );

  // Each restart step falls back to idle on its own. The timer depends only on the state, so unrelated re-renders don't restart it.
  useEffect(() => {
    const ms = restartStepTimeoutMs(restartState);
    if (ms === null) return;
    const id = setTimeout(() => setRestartState('idle'), ms);
    return () => clearTimeout(id);
  }, [restartState]);

  // A pending confirm doesn't survive closing the menu. A restart already running keeps its state.
  useEffect(() => {
    if (!open)
      setRestartState((state) => (state === 'confirm' ? 'idle' : state));
  }, [open]);

  // Right-aligned under the trigger, and pulled inside the window when the trigger sits near an edge.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const bar = trigger.closest<HTMLElement>('[data-topbar-row]') ?? trigger;
      const top = Math.round(bar.getBoundingClientRect().bottom + GAP);
      const width = Math.min(MENU_WIDTH, window.innerWidth - EDGE * 2);
      const fromRight =
        window.innerWidth - trigger.getBoundingClientRect().right;
      const right = Math.min(
        Math.max(EDGE, Math.round(fromRight)),
        window.innerWidth - EDGE - width
      );
      setStyle({
        position: 'fixed',
        top,
        right,
        width,
        maxHeight: `calc(100dvh - ${top + EDGE}px)`,
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  // Opening focuses the first item. Outside click and Escape close the menu.
  useEffect(() => {
    if (!open) return;
    menuItems()[0]?.focus();

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    // Captured, so Escape closes only the menu and not the setup wizard's skip prompt too.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const reload = () => {
    setReloading(true);
    // Short delay so the disabled state paints before the page reloads.
    setTimeout(() => window.location.reload(), 150);
  };

  const onRestartClick = async () => {
    if (!restart) return;
    const action = restartClick(restartState);
    if (action === 'ignore') return;
    if (action === 'confirm') {
      setRestartState('confirm');
      return;
    }
    setRestartState('restarting');
    try {
      await restart();
    } catch (e) {
      setError(String(e));
      setRestartState('error');
    }
  };

  const restartLabel =
    restartState === 'confirm'
      ? l10n.getString('topbar-app-restart-confirm', null, 'Confirm restart')
      : restartState === 'restarting'
        ? l10n.getString('topbar-app-restarting', null, 'Restarting…')
        : l10n.getString('topbar-app-restart', null, 'Restart server…');
  const restartHint =
    restartState === 'confirm'
      ? l10n.getString(
          'topbar-app-restart-confirm-hint',
          null,
          'Click again to restart the server'
        )
      : restartState === 'restarting'
        ? l10n.getString(
            'topbar-app-restarting-hint',
            null,
            'Trackers reconnect in a few seconds'
          )
        : restartState === 'error'
          ? error
          : l10n.getString(
              'topbar-app-restart-hint',
              null,
              'Quits and reopens the Bun Tracker server'
            );
  const restartDanger = restartState === 'confirm' || restartState === 'error';

  return (
    <div
      ref={rootRef}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !rootRef.current?.contains(event.relatedTarget as Node)
        ) {
          setOpen(false);
        }
      }}
    >
      <IconButton
        ref={triggerRef}
        label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={classNames(
          FOCUS_RING,
          open && 'bg-background-10/[0.08] text-background-10'
        )}
      >
        <DotsIcon />
      </IconButton>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="menu"
          aria-label={menuLabel}
          onKeyDown={(event) =>
            moveFocus(event, menuItems(), 'ArrowUp', 'ArrowDown')
          }
          className="fixed z-[70] overflow-y-auto rounded-[12px] border border-[var(--material-border-primary)] bg-background-60 p-1.5 shadow-lg"
          style={{ ...NO_DRAG, ...style }}
        >
          <button
            type="button"
            role="menuitem"
            disabled={reloading}
            onClick={reload}
            className={ITEM_CLASS}
          >
            <span>
              {l10n.getString('topbar-app-reload', null, 'Reload interface')}
            </span>
            <span className="text-ui-2xs font-normal text-background-30">
              {l10n.getString(
                'topbar-app-reload-hint',
                null,
                'Reloads the GUI without restarting the server'
              )}
            </span>
          </button>

          {restart && (
            <button
              type="button"
              role="menuitem"
              disabled={restartState === 'restarting'}
              onClick={onRestartClick}
              className={classNames(
                ITEM_CLASS,
                restartDanger &&
                  'bg-status-critical/10 text-status-critical hover:bg-status-critical/20'
              )}
            >
              <span>{restartLabel}</span>
              <span
                className={classNames(
                  'text-ui-2xs font-normal',
                  restartState === 'error'
                    ? 'text-status-critical'
                    : 'text-background-30'
                )}
              >
                {restartHint}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

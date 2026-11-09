import { useEffect, useId, useRef, useState } from 'react';
import classNames from 'classnames';
import { useLocation } from 'react-router-dom';
import { useTopBarPopover } from '@/hooks/top-bar-popover';
import {
  barPopover,
  barRoot,
  barTrigger,
  useStatusBarMode,
} from '@/components/shell/status-bar-mode';
import { RemoteIcon } from '@/components/commons/icon/RemoteIcon';
import { StatusBarTile } from '@/components/shell/StatusBarTile';
import { RemotePage } from './RemotePage';

export function RemotePopover() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const { pathname } = useLocation();
  const position = useTopBarPopover(rootRef, open, 680);
  const bar = useStatusBarMode();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const outside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={classNames(
        'chatbox-control chatbox-control--top relative flex shrink-0 items-center',
        barRoot(bar),
        open && 'chatbox-control--open'
      )}
      style={{ WebkitAppRegion: 'no-drag' } as any}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
        className={classNames(
          'flex cursor-pointer select-none items-center',
          bar
            ? barTrigger(bar, open)
            : 'h-8 gap-2 rounded-[10px] border border-[var(--material-border-subtle)] px-3 text-ui-xs font-medium',
          bar === 'vr'
            ? ''
            : open
              ? 'bg-accent-background-20/[0.12] text-accent-background-10'
              : 'text-background-10 hover:bg-background-10/[0.06]'
        )}
      >
        {bar === 'vr' ? (
          <StatusBarTile
            icon={<RemoteIcon width={20} height={20} />}
            label="Remote"
          />
        ) : (
          <>
            <RemoteIcon width={16} height={16} className="shrink-0" />
            <span className="truncate">Remote</span>
          </>
        )}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-label="Quest StreamCast remote"
          tabIndex={-1}
          style={position}
          className={classNames(
            'chatbox-popover z-[80] overflow-y-auto overscroll-contain rounded-[14px] border border-background-50 bg-background-80 p-3 shadow-xl',
            barPopover(bar)
          )}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-ui-xs font-semibold text-background-10">
              Remote
            </h2>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-ui-xs text-background-20 hover:bg-background-10/[0.06]"
              onClick={() => {
                setOpen(false);
                buttonRef.current?.focus();
              }}
            >
              Close
            </button>
          </div>
          <RemotePage embedded />
        </div>
      )}
    </div>
  );
}

import { useLocalization } from '@fluent/react';
import classNames from 'classnames';
import { ChatboxDropdown } from '@/components/broadcast/ChatboxDropdown';
import { DonglePill } from '@/components/dongle/DongleStats';
import { QuestDiagnosticsCard } from '@/components/home/QuestDiagnosticsCard';
import { RemotePopover } from '@/components/remote/RemotePopover';
import { StatusCluster } from './StatusCluster';
import {
  StatusBarModeContext,
  useStatusBarModeSetting,
} from './status-bar-mode';
import './StatusBar.scss';

const svg = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  className: 'h-4 w-4 shrink-0',
} as const;

/**
 * Bottom bar with the connection, broadcast, Quest, dongle and remote controls.
 * Desk mode is one slim row; VR mode is big equal-width buttons for a laser pointer.
 * Popovers open upward (data-topbar-row="up", see hooks/top-bar-popover).
 */
export function StatusBar() {
  const { l10n } = useLocalization();
  const [mode, setMode] = useStatusBarModeSetting();
  const vr = mode === 'vr';
  const label = vr
    ? l10n.getString('statusbar-to-desk', null, 'Switch to desk size')
    : l10n.getString('statusbar-to-vr', null, 'Switch to VR size');

  return (
    <StatusBarModeContext.Provider value={mode}>
      <footer
        data-topbar-row="up"
        className={classNames(
          'relative z-[65] flex shrink-0 select-none items-center border-t border-[var(--material-border-subtle)] bg-background-80',
          vr ? 'gap-2 p-2' : 'h-[30px] gap-1 px-2'
        )}
      >
        <div
          className={classNames(
            // Items shrink and their trigger text truncates; nothing here may clip (overflow)
            // or it would clip the popovers too.
            'flex min-w-0 flex-1 items-center [&>*]:min-w-0 [&>*]:shrink',
            vr ? 'gap-2' : 'gap-1'
          )}
        >
          <StatusCluster />
          <ChatboxDropdown variant="top" />
          <QuestDiagnosticsCard />
          <DonglePill />
          <RemotePopover />
        </div>
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={() => setMode(vr ? 'desk' : 'vr')}
          style={{ WebkitAppRegion: 'no-drag' } as any}
          className={classNames(
            'flex shrink-0 cursor-pointer select-none items-center justify-center border border-[var(--material-border-subtle)] font-medium text-background-10',
            vr
              ? 'h-[60px] w-[72px] flex-col gap-1 rounded-[16px] border-[var(--material-border-subtle)] bg-background-70 px-1 text-[12px] leading-none hover:bg-background-60'
              : 'h-6 gap-1.5 rounded-md bg-background-10/[0.05] px-2 text-[12px] hover:bg-background-10/[0.1]'
          )}
        >
          {vr ? (
            <svg {...svg} className="h-5 w-5 shrink-0">
              <rect x="3" y="4" width="18" height="12" rx="2" />
              <path d="M8 20h8M12 16v4" />
            </svg>
          ) : (
            <svg {...svg}>
              <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-3l-2-3h-4l-2 3H5a2 2 0 0 1-2-2z" />
            </svg>
          )}
          <span>
            {vr
              ? l10n.getString('statusbar-desk', null, 'Desk')
              : l10n.getString('statusbar-vr', null, 'VR')}
          </span>
        </button>
      </footer>
    </StatusBarModeContext.Provider>
  );
}

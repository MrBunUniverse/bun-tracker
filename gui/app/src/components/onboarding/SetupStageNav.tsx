import { useLocalization } from '@fluent/react';
import classNames from 'classnames';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useBreakpoint } from '@/hooks/breakpoint';
import { useOnboarding } from '@/hooks/onboarding';
import { WindowControls } from '@/components/shell/WindowControls';
import { setupStages, stageForPath } from './setup-stages';

const NO_DRAG = { WebkitAppRegion: 'no-drag' } as any;

/**
 * One compact row for the setup wizard: every stage can be opened in any order,
 * the current one is marked. Opening a stage only navigates; it never marks setup
 * done, changes settings or starts calibration (each page keeps its own actions).
 */
export function SetupStageNav() {
  const { l10n } = useLocalization();
  const { isMobile } = useBreakpoint('mobile');
  const { slimeSet } = useOnboarding();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const stages = setupStages(slimeSet);
  const current = stageForPath(pathname, stages);
  const label = (s: (typeof stages)[number]) =>
    l10n.getString(s.labelId, null, s.fallback);
  const navLabel = l10n.getString('onboarding-stage-nav', null, 'Setup steps');

  return (
    <div
      className="flex min-h-10 select-none items-center gap-2 border-b border-[var(--material-border-subtle)] px-3 py-1"
      style={{ WebkitAppRegion: 'drag' } as any}
      data-electron-drag-region
    >
      <nav aria-label={navLabel} className="min-w-0 flex-1" style={NO_DRAG}>
        {isMobile ? (
          <select
            aria-label={l10n.getString(
              'onboarding-stage-jump',
              null,
              'Jump to step'
            )}
            value={current?.to ?? ''}
            onChange={(e) => navigate(e.target.value)}
            className="h-8 w-full rounded-[12px] border border-[var(--material-border-subtle)] bg-[var(--material-tertiary)] px-3 text-ui-xs text-background-10"
          >
            {!current && <option value="">{navLabel}</option>}
            {stages.map((s) => (
              <option key={s.id} value={s.to}>
                {label(s)}
              </option>
            ))}
          </select>
        ) : (
          <ol className="m-0 flex list-none items-center gap-1 overflow-x-auto p-0">
            {stages.map((s, i) => {
              const active = s === current;
              return (
                <li key={s.id} className="shrink-0">
                  <Link
                    to={s.to}
                    aria-current={active ? 'step' : undefined}
                    className={classNames(
                      'flex h-8 items-center gap-2 whitespace-nowrap rounded-[12px] px-3 text-ui-xs font-medium',
                      active
                        ? 'bg-accent-background-20/[0.12] text-accent-background-10'
                        : 'text-background-20 hover:bg-background-10/[0.06] hover:text-background-10'
                    )}
                  >
                    <span className="font-mono text-background-30">
                      {i + 1}
                    </span>
                    {label(s)}
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </nav>
      <div style={NO_DRAG}>
        <WindowControls />
      </div>
    </div>
  );
}

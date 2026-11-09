import { useLocalization } from '@fluent/react';
import classNames from 'classnames';
import {
  KeyboardEvent as ReactKeyboardEvent,
  RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useIsMac } from '@/hooks/platform';
import { PixelIcon } from '@/components/commons/PixelIcon';
import { SlimeVRIcon } from '@/components/commons/icon/SimevrIcon';
import { useTopBarPopover } from '@/hooks/top-bar-popover';
import { NAV_ITEMS, NavItem } from './nav-items';
import { isNavRouteActive, splitNavRoutes } from './nav-routes';
import { moveFocus } from './move-focus';
import { AppActionsMenu } from './AppActionsMenu';
import { VersionTag } from './VersionTag';
import { WindowControls } from './WindowControls';

const APP_NAME = 'Bun Tracker';

const NO_DRAG = { WebkitAppRegion: 'no-drag' } as any;
const ITEM_CLASS =
  'topnav__item flex items-center gap-2 rounded-[10px] px-3 text-ui-xs font-medium';
const BAR_ITEM_CLASS = 'h-9 shrink-0 whitespace-nowrap';
const ROW_CLASS = 'flex items-center gap-1';

function itemTone(active: boolean) {
  return active
    ? 'bg-accent-background-20/[0.12] text-accent-background-10'
    : 'text-background-20 hover:bg-background-10/[0.06] hover:text-background-10';
}

function NavItemContent({ item, active }: { item: NavItem; active: boolean }) {
  const { l10n } = useLocalization();
  return (
    <>
      <span
        className={classNames(
          'flex h-5 w-5 shrink-0 items-center justify-center',
          active
            ? 'fill-accent-background-10 text-accent-background-10'
            : 'fill-background-30 text-background-30'
        )}
      >
        {item.icon}
      </span>
      <span>{l10n.getString(item.labelId, null, item.fallback)}</span>
    </>
  );
}

function TopNavLink({
  item,
  className,
  onClick,
}: {
  item: NavItem;
  className: string;
  onClick?: () => void;
}) {
  const { pathname } = useLocation();
  const active = isNavRouteActive(item, pathname);

  return (
    <Link
      to={item.to}
      state={item.state}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      style={NO_DRAG}
      className={classNames(ITEM_CLASS, className, itemTone(active))}
    >
      <NavItemContent item={item} active={active} />
    </Link>
  );
}

/**
 * Whether the full row fits. The row is measured from a hidden copy, so the answer depends only
 * on the space and the row itself, never on which layout is showing: it can't flip back and
 * forth at the boundary, and it follows window size, zoom, text size and language alike.
 */
function useAllDestinationsFit(
  spaceRef: RefObject<HTMLElement>,
  rowRef: RefObject<HTMLElement>
) {
  const [allFit, setAllFit] = useState(true);

  useLayoutEffect(() => {
    const space = spaceRef.current;
    const row = rowRef.current;
    if (!space || !row) return;
    const check = () =>
      setAllFit(
        row.getBoundingClientRect().width <= space.getBoundingClientRect().width
      );
    check();
    const observer = new ResizeObserver(check);
    observer.observe(space);
    observer.observe(row);
    return () => observer.disconnect();
  }, [spaceRef, rowRef]);

  return allFit;
}

function MoreMenu({ items }: { items: NavItem[] }) {
  const { l10n } = useLocalization();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const popover = useTopBarPopover(rootRef, open, 240);
  const panelId = useId();
  const active = items.some((item) => isNavRouteActive(item, pathname));

  const panelLinks = () =>
    Array.from(panelRef.current?.querySelectorAll<HTMLElement>('a') ?? []);

  // A digit shortcut can change the page while the menu is open.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const links = panelLinks();
    (
      links.find((link) => link.hasAttribute('aria-current')) ?? links[0]
    )?.focus();

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    // Captured, so Escape closes only the menu and not the setup wizard's skip prompt too.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !rootRef.current?.contains(event.relatedTarget)
        ) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-current={active ? 'true' : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        style={NO_DRAG}
        className={classNames(
          ITEM_CLASS,
          BAR_ITEM_CLASS,
          'cursor-pointer',
          itemTone(active),
          open && !active && 'bg-background-10/[0.08]'
        )}
      >
        <span>{l10n.getString('nav-more', null, 'More')}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={classNames('shrink-0', open && 'rotate-180')}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          onKeyDown={(event) =>
            moveFocus(event, panelLinks(), 'ArrowUp', 'ArrowDown')
          }
          className="fixed z-[70] overflow-y-auto rounded-[12px] border border-[var(--material-border-primary)] bg-background-60 p-2 shadow-lg"
          style={popover}
        >
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.to}>
                <TopNavLink
                  item={item}
                  className="min-h-9 w-full py-1.5"
                  onClick={() => {
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function TopNav() {
  const { l10n } = useLocalization();
  const isMac = useIsMac();
  const spaceRef = useRef<HTMLElement>(null);
  const fullRowRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const allFit = useAllDestinationsFit(spaceRef, fullRowRef);
  const { bar, more } = splitNavRoutes(NAV_ITEMS, allFit);

  // Left/Right/Home/End move between destinations.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    const items = Array.from(listRef.current?.children ?? []).flatMap(
      (entry) => entry.querySelector<HTMLElement>('a, button') ?? []
    );
    moveFocus(event, items, 'ArrowLeft', 'ArrowRight');
  };

  return (
    // Mac: the nav row is the title bar. The traffic lights are native and ignore the app's zoom, so the inset and
    // the 46 pt row main.rs centres them in are divided by --ui-zoom (set by main.rs) to stay fixed on screen.
    <header
      className="topnav flex min-h-[46px] shrink-0 select-none items-center gap-2 border-b border-[var(--material-border-subtle)] bg-background-70 px-3 py-[5px]"
      style={
        {
          WebkitAppRegion: 'drag',
          ...(isMac && {
            paddingLeft: 'calc(92px / var(--ui-zoom, 1))',
            minHeight: 'max(46px, calc(46px / var(--ui-zoom, 1)))',
          }),
        } as any
      }
      data-electron-drag-region
    >
      {/* Bun: the logo is redrawn as pixel art, like the app icon. Other themes get the vector logo. */}
      <span
        role="img"
        aria-label={APP_NAME}
        title={APP_NAME}
        className="flex shrink-0"
      >
        <PixelIcon size={30} grid={24}>
          <SlimeVRIcon />
        </PixelIcon>
      </span>

      <nav
        ref={spaceRef}
        aria-label={l10n.getString(
          'nav-primary-label',
          null,
          'Primary navigation'
        )}
        className="relative min-w-0 flex-1"
      >
        <div
          aria-hidden="true"
          className="invisible absolute h-0 w-0 overflow-hidden"
        >
          <div ref={fullRowRef} className={classNames(ROW_CLASS, 'w-max')}>
            {NAV_ITEMS.map((item) => (
              <span
                key={item.to}
                className={classNames(ITEM_CLASS, BAR_ITEM_CLASS)}
              >
                <NavItemContent item={item} active={false} />
              </span>
            ))}
          </div>
        </div>

        {/* Wrapping is the last resort: at extreme zoom even Home, Remote and More can run out of room. */}
        <ul
          ref={listRef}
          onKeyDown={onKeyDown}
          className={classNames(ROW_CLASS, 'flex-wrap')}
        >
          {bar.map((item) => (
            <li key={item.to}>
              <TopNavLink item={item} className={BAR_ITEM_CLASS} />
            </li>
          ))}
          {more.length > 0 && (
            <li>
              <MoreMenu items={more} />
            </li>
          )}
        </ul>
      </nav>
      <div className="flex shrink-0 items-center gap-1" style={NO_DRAG}>
        <VersionTag />
        <AppActionsMenu />
        <WindowControls />
      </div>
    </header>
  );
}

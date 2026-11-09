import { useLocalization } from '@fluent/react';
import { ReactNode, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NAV_ITEMS } from './nav-items';
import { StatusBar } from './StatusBar';
import { TopNav } from './TopNav';

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * Wraps every screen. Provides the skip link, the top navigation, the `main`
 * landmark and the global Cmd/Ctrl+1..5 shortcuts that jump between pages.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { l10n } = useLocalization();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Lets CSS pause decorative animations while the window is hidden.
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => root.classList.toggle('is-page-hidden', document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }

      const item = NAV_ITEMS.find(
        (candidate) => candidate.shortcut === event.key
      );
      if (item) {
        event.preventDefault();
        navigate(item.to, { state: item.state });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  return (
    <div className="flex h-full w-full flex-col">
      <a
        href="#main-content"
        className="skip-link text-ui-xs font-medium"
        onClick={(event) => {
          // The app uses hash routing, so a bare #anchor must not navigate.
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        {l10n.getString('nav-skip-to-content', null, 'Skip to content')}
      </a>
      <TopNav />
      <div className="flex min-h-0 w-full flex-1">
        <main
          id="main-content"
          tabIndex={-1}
          className="h-full min-w-0 flex-1 outline-none"
        >
          {children}
        </main>
      </div>
      {/* The setup wizard has no status bar. */}
      {!pathname.startsWith('/onboarding') && <StatusBar />}
    </div>
  );
}

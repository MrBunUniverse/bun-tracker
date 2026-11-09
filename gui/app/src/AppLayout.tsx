import { useEffect, useLayoutEffect, useRef } from 'react';
import { useConfig } from './hooks/config';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AppShell } from './components/shell/AppShell';

export function AppLayout() {
  const { config } = useConfig();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useLayoutEffect(() => {
    if (!config) return;
    // config.theme is already normalized when the config loads (hooks/theme.ts).
    document.documentElement.dataset.theme = config.theme;
    try {
      // Read by index.html on the next start to paint the right background.
      localStorage.setItem('slimevr-theme-hint', config.theme);
    } catch {
      // storage unavailable; the dark default is used
    }

    const bgStyle = localStorage.getItem('slimevr-bg-style') || 'grid';
    document.documentElement.dataset.bgStyle = bgStyle;

    if (config.fonts !== undefined) {
      document.documentElement.style.setProperty(
        '--font-name',
        config.fonts.map((x) => `"${x}"`).join(',')
      );
    }

    if (config.textSize !== undefined) {
      document.documentElement.style.setProperty(
        '--font-size',
        `${config.textSize}rem`
      );
    }
  }, [config]);

  // Offer the setup wizard once, when the app starts. It must not re-run on
  // later config changes or navigation, otherwise opening Settings or another
  // tab bounces you back to setup while onboarding is still unfinished.
  const onboardingChecked = useRef(false);
  useLayoutEffect(() => {
    if (!config || onboardingChecked.current) return;
    onboardingChecked.current = true;
    if (!config.doneOnboarding && !pathname.startsWith('/onboarding/')) {
      navigate('/onboarding/home');
    }
  }, [config]);

  useEffect(() => {
    const handleSettingsShortcut = (event: KeyboardEvent) => {
      if (
        !event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        event.code !== 'Comma'
      ) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }

      event.preventDefault();
      navigate('/settings/trackers');
    };

    window.addEventListener('keydown', handleSettingsShortcut);
    return () => window.removeEventListener('keydown', handleSettingsShortcut);
  }, [navigate]);

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

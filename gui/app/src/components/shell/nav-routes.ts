import { matchPath } from 'react-router-dom';

export interface NavRoute {
  to: string;
  /** Route pattern used to decide the active item (defaults to `to`). */
  match?: string;
  /** Route pattern that turns the item off even when `match` fits. */
  exclude?: string;
  labelId: string;
  fallback: string;
  /** Cmd/Ctrl + this digit opens the page. */
  shortcut: string;
  /** Location state passed when the item is opened. */
  state?: Record<string, unknown>;
  /** Stays in the bar when the rest of the destinations move into More. */
  primary?: boolean;
}

export const NAV_ROUTES: NavRoute[] = [
  // Welcome (the Setup Wizard's home) comes first.
  {
    to: '/onboarding/home',
    match: '/onboarding/*',
    exclude: '/onboarding/body-proportions/*',
    labelId: 'navbar-onboarding',
    fallback: 'Setup Wizard',
    shortcut: '3',
  },
  {
    to: '/',
    labelId: 'navbar-home',
    fallback: 'Home',
    shortcut: '1',
    primary: true,
  },
  {
    to: '/onboarding/body-proportions/scaled',
    match: '/onboarding/body-proportions/*',
    labelId: 'navbar-body_proportions',
    fallback: 'Body Proportions',
    shortcut: '5',
    state: { alonePage: true },
  },
  {
    to: '/settings',
    match: '/settings/*',
    labelId: 'navbar-settings',
    fallback: 'Settings',
    shortcut: '4',
  },
];

export function isNavRouteActive(route: NavRoute, pathname: string) {
  const matched = !!matchPath(
    { path: route.match || route.to, end: !route.match },
    pathname
  );
  const excluded = !!route.exclude && !!matchPath(route.exclude, pathname);
  return matched && !excluded;
}

/** Every destination in the bar when they all fit, otherwise the primary ones plus More. */
export function splitNavRoutes<T extends NavRoute>(routes: T[], allFit: boolean) {
  return allFit
    ? { bar: routes, more: [] as T[] }
    : {
        bar: routes.filter((route) => route.primary),
        more: routes.filter((route) => !route.primary),
      };
}

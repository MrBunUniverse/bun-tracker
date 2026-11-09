import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NAV_ROUTES,
  isNavRouteActive,
  splitNavRoutes,
} from '../src/components/shell/nav-routes.ts';

const activeLabels = (pathname: string) =>
  NAV_ROUTES.filter((route) => isNavRouteActive(route, pathname)).map(
    (route) => route.fallback
  );

test('exactly the expected destination is active for each route', () => {
  const expected: Record<string, string[]> = {
    '/': ['Home'],
    '/remote': [],
    '/settings': ['Settings'],
    '/settings/trackers': ['Settings'],
    '/settings/osc/router': ['Settings'],
    '/onboarding/home': ['Setup Wizard'],
    '/onboarding/wifi-creds': ['Setup Wizard'],
    '/onboarding/body-proportions/scaled': ['Body Proportions'],
    '/onboarding/body-proportions/auto': ['Body Proportions'],
    '/tracker/1/2': [],
  };
  for (const [pathname, labels] of Object.entries(expected)) {
    assert.deepEqual(activeLabels(pathname), labels, pathname);
  }
});

test('every destination keeps one place in the full row', () => {
  const { bar, more } = splitNavRoutes(NAV_ROUTES, true);
  assert.deepEqual(bar, NAV_ROUTES);
  assert.deepEqual(more, []);
});

test('narrow space keeps Home and moves the rest into More', () => {
  const { bar, more } = splitNavRoutes(NAV_ROUTES, false);
  assert.deepEqual(
    bar.map((route) => route.fallback),
    ['Home']
  );
  assert.deepEqual(
    more.map((route) => route.fallback),
    ['Setup Wizard', 'Body Proportions', 'Settings']
  );
});

test('More reads as active exactly when one of its pages is open', () => {
  const { more } = splitNavRoutes(NAV_ROUTES, false);
  const moreActive = (pathname: string) =>
    more.some((route) => isNavRouteActive(route, pathname));
  assert.equal(moreActive('/settings/trackers'), true);
  assert.equal(moreActive('/onboarding/body-proportions/scaled'), true);
  assert.equal(moreActive('/onboarding/home'), true);
  assert.equal(moreActive('/'), false);
  assert.equal(moreActive('/remote'), false);
});

test('digit shortcuts stay unique', () => {
  const shortcuts = NAV_ROUTES.map((route) => route.shortcut);
  assert.equal(new Set(shortcuts).size, NAV_ROUTES.length);
});

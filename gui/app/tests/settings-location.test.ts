import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSettingsLocation } from '../src/components/settings/settings-location.ts';

test('saved settings preserve the section and both scroll positions', () => {
  const saved = {
    pathname: '/settings/interface',
    scrollTo: 'appearance',
    top: 1234,
    sidebarTop: 160,
  };
  assert.deepEqual(parseSettingsLocation(JSON.stringify(saved)), saved);
});

test('a saved Home Screen location from before the layout picker was removed still restores', () => {
  // The retired "home" anchor is a no-op now; the page still opens at Tracking checklist.
  const saved = {
    pathname: '/settings/interface/home',
    scrollTo: 'home',
    top: 96,
    sidebarTop: 40,
  };
  assert.deepEqual(parseSettingsLocation(JSON.stringify(saved)), saved);
});

test('invalid or obsolete saved destinations fall back safely', () => {
  for (const raw of [
    null,
    '{',
    'null',
    JSON.stringify({ pathname: '/remote', top: 0, sidebarTop: 0 }),
    JSON.stringify({ pathname: '/settings/removed', top: 0, sidebarTop: 0 }),
    JSON.stringify({ pathname: '/settings/quest-capture', top: 0, sidebarTop: 0 }),
    JSON.stringify({ pathname: '/settings/trackers', top: -1, sidebarTop: 0 }),
    JSON.stringify({ pathname: '/settings/trackers', top: '42', sidebarTop: 0 }),
  ]) {
    assert.equal(parseSettingsLocation(raw), null);
  }
});

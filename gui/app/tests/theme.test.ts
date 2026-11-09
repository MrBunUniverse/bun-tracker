import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_THEME,
  PAW_THEMES,
  normalizeTheme,
  withNormalizedTheme,
} from '../src/hooks/theme.ts';

test('current special themes are kept', () => {
  for (const theme of ['bun', 'fox', 'dog']) {
    assert.equal(normalizeTheme(theme), theme);
  }
  assert.deepEqual(PAW_THEMES, ['bun', 'fox', 'dog']);
});

test('retired, unknown, and missing themes fall back to Bun', () => {
  const retired = [
    'claude',
    'macos',
    'slime',
    'slime-green',
    'slime-yellow',
    'slime-orange',
    'slime-red',
    'dark',
    'light',
    'trans',
    'asexual',
    'snep',
    '',
    'Fox',
    'nope',
  ];
  for (const theme of retired) {
    assert.equal(normalizeTheme(theme), 'bun', theme);
  }
  for (const theme of [undefined, null, 7, {}, ['fox']]) {
    assert.equal(normalizeTheme(theme), DEFAULT_THEME);
  }
  assert.equal(DEFAULT_THEME, 'bun');
});

test('normalizing a loaded config changes only the theme', () => {
  const saved = {
    theme: 'claude',
    lang: 'de',
    textSize: 14,
    pawEars: false,
    animations: false,
    devSettings: { highContrast: true },
  };
  const loaded = withNormalizedTheme(saved);
  assert.deepEqual(loaded, { ...saved, theme: 'bun' });
  assert.equal(saved.theme, 'claude', 'input is not mutated');

  const fox = withNormalizedTheme({ ...saved, theme: 'fox' });
  assert.deepEqual(fox, { ...saved, theme: 'fox' });

  const missing = withNormalizedTheme({ lang: 'fr' });
  assert.deepEqual(missing, { lang: 'fr', theme: 'bun' });
});

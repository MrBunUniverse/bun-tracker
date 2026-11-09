import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTROLS_MIN,
  HANDLE_SIZE,
  PREVIEW_MIN,
  clampPreview,
  defaultPreview,
  keyboardPreview,
  parseStoredPreview,
  splitBounds,
} from '../src/utils/pane-split.ts';

test('tall containers keep both pane minimums', () => {
  const { min, max } = splitBounds(800);
  assert.equal(min, PREVIEW_MIN);
  assert.equal(max, 800 - HANDLE_SIZE - CONTROLS_MIN);
  assert.equal(clampPreview(10, 800), min);
  assert.equal(clampPreview(5000, 800), max);
});

test('short or degenerate containers never invert the bounds', () => {
  for (const h of [0, 20, 100, 200, 300, 400]) {
    const { min, max } = splitBounds(h);
    assert.ok(min >= 0 && max >= min, `${h}: ${min}..${max}`);
    const avail = Math.max(0, h - HANDLE_SIZE);
    assert.ok(max <= avail, `${h}: preview leaves no room`);
  }
  // 300px: both panes still get room instead of the preview taking everything
  const { min, max } = splitBounds(300);
  assert.ok(min > 0 && 300 - HANDLE_SIZE - max > 0);
});

test('default is 35% clamped to 10-24rem and inside the bounds', () => {
  assert.equal(defaultPreview(600), 210);
  assert.equal(defaultPreview(300), clampPreview(105, 300));
  assert.equal(defaultPreview(2000), 384);
});

test('shrinking the window clamps without touching the stored preference', () => {
  const pref = 500;
  assert.equal(clampPreview(pref, 600), splitBounds(600).max);
  assert.equal(clampPreview(pref, 1200), 500);
});

test('stored values are validated', () => {
  assert.equal(parseStoredPreview('240'), 240);
  assert.equal(parseStoredPreview('240.5'), 240.5);
  for (const bad of [
    null,
    '',
    'abc',
    '-5',
    '0',
    'NaN',
    'Infinity',
    '1e9',
    '99999',
    '12px',
  ]) {
    assert.equal(parseStoredPreview(bad), null, String(bad));
  }
});

test('keyboard mapping', () => {
  const c = 800;
  assert.equal(keyboardPreview('ArrowUp', false, 300, c), 284);
  assert.equal(keyboardPreview('ArrowDown', false, 300, c), 316);
  assert.equal(keyboardPreview('ArrowDown', true, 300, c), 364);
  assert.equal(keyboardPreview('ArrowUp', true, 170, c), PREVIEW_MIN);
  assert.equal(keyboardPreview('Home', false, 300, c), splitBounds(c).min);
  assert.equal(keyboardPreview('End', false, 300, c), splitBounds(c).max);
  assert.equal(keyboardPreview('a', false, 300, c), null);
});

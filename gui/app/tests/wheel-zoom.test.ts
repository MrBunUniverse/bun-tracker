import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wheelZoomFactor } from '../src/utils/wheel-zoom.ts';

test('a mouse notch zooms about 12% in and out, symmetrically', () => {
  const zoomIn = wheelZoomFactor(-4, 0, 120);
  const zoomOut = wheelZoomFactor(4, 0, -120);
  assert.ok(Math.abs(zoomIn - 1.12) < 1e-9);
  assert.ok(Math.abs(zoomIn * zoomOut - 1) < 1e-9);
  assert.ok(Math.abs(wheelZoomFactor(-8, 0, 240) - 1.12 ** 2) < 1e-9);
});

test('small trackpad deltas zoom proportionally and in the right direction', () => {
  const a = Math.log(wheelZoomFactor(-2, 0, -2));
  const b = Math.log(wheelZoomFactor(-4, 0, -4));
  assert.ok(a > 0 && Math.abs(b / a - 2) < 1e-9);
  assert.ok(wheelZoomFactor(5, 0, 5) < 1);
});

test('huge deltas are clamped per event', () => {
  const max = wheelZoomFactor(-60, 0, -60);
  assert.equal(wheelZoomFactor(-5000, 0, -5000), max);
  assert.equal(wheelZoomFactor(5000, 0, 5000), 1 / max);
});

test('line mode is normalised to pixels and pinch has its own gain', () => {
  assert.ok(Math.abs(wheelZoomFactor(-1, 1) - wheelZoomFactor(-16, 0)) < 1e-12);
  assert.ok(wheelZoomFactor(-2, 0, undefined, true) > wheelZoomFactor(-2, 0));
});

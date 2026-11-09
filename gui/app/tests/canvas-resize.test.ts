import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasResizer } from '../src/utils/canvas-resize.ts';

function harness(initial?: { width: number; height: number }) {
  const log: string[] = [];
  const resize = createCanvasResizer(
    (w, h) => log.push(`size ${w}x${h}`),
    () => log.push('draw'),
    initial
  );
  return { log, resize };
}

test('every size change is drawn immediately after the buffer is resized', () => {
  const { log, resize } = harness();
  for (const h of [300, 310, 325]) resize(400, h);
  assert.deepEqual(log, [
    'size 400x300',
    'draw',
    'size 400x310',
    'draw',
    'size 400x325',
    'draw',
  ]);
});

test('repeated or empty sizes neither clear nor redraw', () => {
  const { log, resize } = harness({ width: 400, height: 300 });
  assert.equal(resize(400, 300), false);
  assert.equal(resize(0, 300), false);
  assert.equal(resize(400, 0), false);
  assert.deepEqual(log, []);
  assert.equal(resize(400, 301), true);
  assert.equal(resize(400, 301), false);
  assert.deepEqual(log, ['size 400x301', 'draw']);
});

test('a collapsed pane keeps the last size, so reopening it to that size is a no-op', () => {
  const { log, resize } = harness({ width: 400, height: 300 });
  resize(400, 0);
  assert.equal(resize(400, 300), false);
  assert.deepEqual(log, []);
});

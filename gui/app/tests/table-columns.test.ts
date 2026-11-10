import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitColumns } from '../src/utils/table-columns.ts';

const has = { type: true, temp: true, preciseRotation: false };

test('unmeasured or wide lists show every column with data', () => {
  assert.deepEqual(fitColumns(0, has), {
    type: true,
    tps: true,
    temp: true,
    rot: true,
  });
  assert.deepEqual(fitColumns(1400, has), {
    type: true,
    tps: true,
    temp: true,
    rot: true,
  });
  assert.equal(fitColumns(1400, { ...has, temp: false }).temp, false);
});

test('a narrow list drops rotation first, then temp, tps and type', () => {
  // Base is 480 px; type 96, tps 56, temp 72, rotation 112.
  assert.deepEqual(fitColumns(480 + 96 + 56 + 72 + 111, has), {
    type: true,
    tps: true,
    temp: true,
    rot: false,
  });
  assert.deepEqual(fitColumns(480 + 96 + 56, has), {
    type: true,
    tps: true,
    temp: false,
    rot: false,
  });
  assert.deepEqual(fitColumns(400, has), {
    type: false,
    tps: false,
    temp: false,
    rot: false,
  });
});

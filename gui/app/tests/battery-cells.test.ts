import { test } from 'node:test';
import assert from 'node:assert/strict';
import { batteryLevel, batteryRedness } from '../src/utils/battery-cells.ts';

test('battery level rounds, clamps and reports unknown charge as null', () => {
  assert.equal(batteryLevel(78.4), 78);
  assert.equal(batteryLevel(-5), 0);
  assert.equal(batteryLevel(150), 100);
  assert.equal(batteryLevel(null), null);
  assert.equal(batteryLevel(undefined), null);
  assert.equal(batteryLevel(Number.NaN), null);
});

test('the motion rim turns visibly red below 50%, full red at 10%, and stays plain when unknown', () => {
  assert.equal(batteryRedness(80), 0);
  assert.equal(batteryRedness(50), 0);
  assert.ok(batteryRedness(48) > 0.3, 'just under 50% is already visibly red');
  assert.ok(Math.abs(batteryRedness(30) - 0.65) < 1e-9);
  assert.equal(batteryRedness(10), 1);
  assert.equal(batteryRedness(0), 1);
  assert.equal(batteryRedness(null), 0);
  assert.equal(batteryRedness(undefined), 0);
});

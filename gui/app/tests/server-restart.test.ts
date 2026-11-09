import test from 'node:test';
import assert from 'node:assert/strict';
import {
  restartClick,
  restartStepTimeoutMs,
} from '../src/components/shell/server-restart.ts';

test('a restart asks first and runs on the second click', () => {
  assert.equal(restartClick('idle'), 'confirm');
  assert.equal(restartClick('confirm'), 'restart');
  assert.equal(restartClick('error'), 'confirm');
  assert.equal(restartClick('restarting'), 'ignore');
});

test('a pending confirm expires after 3s, a finished or failed restart after 6s, idle never', () => {
  assert.equal(restartStepTimeoutMs('confirm'), 3000);
  assert.equal(restartStepTimeoutMs('restarting'), 6000);
  assert.equal(restartStepTimeoutMs('error'), 6000);
  assert.equal(restartStepTimeoutMs('idle'), null);
});

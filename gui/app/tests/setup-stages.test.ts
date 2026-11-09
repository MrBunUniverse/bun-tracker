import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setupStages,
  stageForPath,
  stageNeighbours,
} from '../src/components/onboarding/setup-stages.ts';

const ids = (set?: Parameters<typeof setupStages>[0]) =>
  setupStages(set).map((s) => s.id);

test('connection stages follow the chosen tracker type', () => {
  assert.deepEqual(ids('wifi-slime'), [
    'trackers',
    'wifi',
    'assign',
    'mounting',
    'proportions',
    'usage',
  ]);
  assert.deepEqual(ids('slime-v1'), ids('wifi-slime'));
  assert.deepEqual(ids('butterfly'), [
    'trackers',
    'dongle',
    'assign',
    'mounting',
    'proportions',
    'usage',
  ]);
  assert.deepEqual(ids('dongle-slime'), ids('butterfly'));
});

test('with no choice yet both connection paths stay reachable', () => {
  assert.deepEqual(ids(undefined).slice(0, 3), ['trackers', 'wifi', 'dongle']);
});

test('every wizard route maps to a stage; sub-routes share their stage', () => {
  const stages = setupStages();
  const expected: Record<string, string> = {
    '/onboarding/quiz/slime-set': 'trackers',
    '/onboarding/wifi-creds': 'wifi',
    '/onboarding/connect-trackers': 'wifi',
    '/onboarding/dongle': 'dongle',
    '/onboarding/trackers-assign': 'assign',
    '/onboarding/mounting/choose': 'mounting',
    '/onboarding/mounting/auto': 'mounting',
    '/onboarding/mounting/manual': 'mounting',
    '/onboarding/body-proportions/scaled': 'proportions',
    '/onboarding/body-proportions/auto': 'proportions',
    '/onboarding/body-proportions/manual': 'proportions',
    '/onboarding/quiz/usage': 'usage',
    '/onboarding/quiz/runtime': 'usage',
    '/onboarding/quiz/mocap-pos': 'usage',
    '/onboarding/quiz/usage/': 'usage',
  };
  for (const [path, id] of Object.entries(expected)) {
    assert.equal(stageForPath(path, stages)?.id, id, path);
  }
});

test('unknown or non-wizard routes have no current stage', () => {
  const stages = setupStages('wifi-slime');
  for (const path of [
    '/onboarding/home',
    '/onboarding/stay-aligned',
    '/onboarding/nope',
    '/',
    '/settings',
  ])
    assert.equal(stageForPath(path, stages), undefined, path);
  // the dongle page is not a stage of the Wi-Fi branch
  assert.equal(stageForPath('/onboarding/dongle', stages), undefined);
  assert.deepEqual(stageNeighbours(stages, undefined), {});
});

test('neighbours give back and forward membership with open ends', () => {
  const stages = setupStages('butterfly');
  const at = (id: string) => stages.find((s) => s.id === id);
  assert.equal(stageNeighbours(stages, at('trackers')).prev, undefined);
  assert.equal(stageNeighbours(stages, at('trackers')).next?.id, 'dongle');
  assert.equal(stageNeighbours(stages, at('mounting')).prev?.id, 'assign');
  assert.equal(stageNeighbours(stages, at('mounting')).next?.id, 'proportions');
  assert.equal(stageNeighbours(stages, at('usage')).next, undefined);
});

test('stage targets never include the provisioning route', () => {
  for (const set of [undefined, 'butterfly', 'wifi-slime'] as const)
    for (const s of setupStages(set))
      assert.notEqual(s.to, '/onboarding/connect-trackers');
});

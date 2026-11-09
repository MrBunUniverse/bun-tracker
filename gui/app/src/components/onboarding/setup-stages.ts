export type SlimeSet = 'butterfly' | 'slime-v1' | 'dongle-slime' | 'wifi-slime';

export interface SetupStage {
  id: 'trackers' | 'wifi' | 'dongle' | 'assign' | 'mounting' | 'proportions' | 'usage';
  /** Route opened when the stage is picked. Opening it never starts hardware work. */
  to: string;
  labelId: string;
  fallback: string;
  /** Other onboarding routes that belong to the same stage. */
  also: string[];
}

const TRACKERS: SetupStage = {
  id: 'trackers',
  to: '/onboarding/quiz/slime-set',
  labelId: 'onboarding-stage-trackers',
  fallback: 'Tracker type',
  also: [],
};
// connect-trackers starts Wi-Fi provisioning on mount, so it is only reached
// from the Wi-Fi form's own submit, never from a stage pick.
const WIFI: SetupStage = {
  id: 'wifi',
  to: '/onboarding/wifi-creds',
  labelId: 'onboarding-stage-wifi',
  fallback: 'Wi-Fi',
  also: ['/onboarding/connect-trackers'],
};
const DONGLE: SetupStage = {
  id: 'dongle',
  to: '/onboarding/dongle',
  labelId: 'onboarding-stage-dongle',
  fallback: 'Dongle',
  also: [],
};
const AFTER_CONNECT: SetupStage[] = [
  {
    id: 'assign',
    to: '/onboarding/trackers-assign',
    labelId: 'onboarding-stage-assign',
    fallback: 'Assignment',
    also: [],
  },
  {
    id: 'mounting',
    to: '/onboarding/mounting/choose',
    labelId: 'onboarding-stage-mounting',
    fallback: 'Mounting',
    also: ['/onboarding/mounting/auto', '/onboarding/mounting/manual'],
  },
  {
    id: 'proportions',
    to: '/onboarding/body-proportions/scaled',
    labelId: 'onboarding-stage-proportions',
    fallback: 'Proportions',
    also: ['/onboarding/body-proportions/auto', '/onboarding/body-proportions/manual'],
  },
  {
    id: 'usage',
    to: '/onboarding/quiz/usage',
    labelId: 'onboarding-stage-usage',
    fallback: 'Usage',
    also: ['/onboarding/quiz/runtime', '/onboarding/quiz/mocap-pos'],
  },
];

/**
 * Stages for the chosen tracker type, in wizard order. Dongle trackers skip the
 * Wi-Fi stage and Wi-Fi trackers skip the dongle one. Before a choice is made
 * both connection stages are offered, so either path can be opened.
 */
export function setupStages(slimeSet?: SlimeSet): SetupStage[] {
  const connect =
    slimeSet === 'butterfly' || slimeSet === 'dongle-slime'
      ? [DONGLE]
      : slimeSet
        ? [WIFI]
        : [WIFI, DONGLE];
  return [TRACKERS, ...connect, ...AFTER_CONNECT];
}

/** The stage a route belongs to, or undefined for routes outside the wizard flow. */
export function stageForPath(
  pathname: string,
  stages: SetupStage[]
): SetupStage | undefined {
  const path = pathname.replace(/\/+$/, '');
  return stages.find((s) => s.to === path || s.also.includes(path));
}

/** Neighbours of the current stage; either end is undefined at the edges. */
export function stageNeighbours(
  stages: SetupStage[],
  current?: SetupStage
): { prev?: SetupStage; next?: SetupStage } {
  const i = current ? stages.indexOf(current) : -1;
  if (i < 0) return {};
  return { prev: stages[i - 1], next: stages[i + 1] };
}

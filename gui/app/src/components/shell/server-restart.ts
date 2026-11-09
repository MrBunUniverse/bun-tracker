export type RestartState = 'idle' | 'confirm' | 'restarting' | 'error';

/**
 * How long a restart step waits before falling back to idle. A confirm that is
 * never repeated expires quickly; a finished or failed restart stays readable a bit longer.
 */
export function restartStepTimeoutMs(state: RestartState): number | null {
  if (state === 'idle') return null;
  return state === 'confirm' ? 3000 : 6000;
}

/** What a click on the restart item does: ask first, run the restart on the second click, or nothing while it runs. */
export function restartClick(state: RestartState): 'confirm' | 'restart' | 'ignore' {
  if (state === 'restarting') return 'ignore';
  return state === 'confirm' ? 'restart' : 'confirm';
}

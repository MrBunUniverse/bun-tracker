import { useOnboarding } from '@/hooks/onboarding';
import { useLocalization } from '@fluent/react';
import { useState } from 'react';
import { SkipSetupWarningModal } from '@/components/onboarding/SkipSetupWarningModal';
import classNames from 'classnames';
import { Typography } from '@/components/commons/Typography';
import { Button } from '@/components/commons/Button';
import {
  OnboardingActions,
  OnboardingPage,
  OnboardingPanel,
} from '@/components/onboarding/OnboardingPanel';
import { countMetric } from '@/utils/sentry';

export function MountingChoose() {
  const { l10n } = useLocalization();
  const { applyProgress, skipSetup, state } = useOnboarding();
  const [showWarning, setShowWarning] = useState(false);

  applyProgress(0.55);

  return (
    <>
      <OnboardingPage>
        <OnboardingPanel className="gap-6">
          <div>
            <Typography variant="main-title">
              {l10n.getString('onboarding-choose_mounting')}
            </Typography>
            <Typography variant="standard" whitespace="whitespace-pre-line">
              {l10n.getString('onboarding-choose_mounting-description')}
            </Typography>
          </div>
          <div
            className={classNames(
              'grid xs:grid-cols-2 w-full xs:flex-row mobile:flex-col gap-4 mt-2 [&>div]:grow [&_*]:[hyphens:manual]'
            )}
          >
            <div
              className={classNames(
                'rounded-[20px] p-5 sm:p-6 flex flex-col relative border bg-background-60/40 dark:bg-background-10/[0.03] border-background-50/50 dark:border-background-10/[0.06] hover:border-background-40 dark:hover:border-background-10/[0.15] hover:bg-background-60/60 dark:hover:bg-background-10/[0.05] transition-all duration-200'
              )}
            >
              {/* Sits on the card's top edge, so both cards' titles start at the same height. */}
              <div className="absolute -top-3 left-5 bg-background-70 border border-accent-background-20/30 text-accent-background-30 px-3 py-0.5 rounded-full text-xs font-mono font-medium tracking-wide uppercase">
                <Typography variant="vr-accessible">
                  {l10n.getString(
                    'onboarding-choose_mounting-auto_mounting-label-v2'
                  )}
                </Typography>
              </div>
              <div className="flex flex-col gap-4 flex-grow">
                <div className="flex flex-grow flex-col gap-2 max-w-sm">
                  <div>
                    <Typography variant="section-title" bold>
                      {l10n.getString(
                        'onboarding-choose_mounting-auto_mounting'
                      )}
                    </Typography>
                  </div>
                  <div>
                    <Typography>
                      {l10n.getString(
                        'onboarding-choose_mounting-auto_mounting-description'
                      )}
                    </Typography>
                  </div>
                </div>
                <Button
                  variant="primary"
                  to={'/onboarding/mounting/auto'}
                  className="self-start mt-auto"
                  onClick={() => {
                    countMetric('mounting_choose', 1, {
                      attributes: { choose: 'auto' },
                    });
                  }}
                  state={{ alonePage: state.alonePage }}
                >
                  {l10n.getString('onboarding-manual_mounting-auto_mounting')}
                </Button>
              </div>
            </div>
            <div
              className={classNames(
                'rounded-[20px] p-5 sm:p-6 flex flex-col relative border bg-background-60/40 dark:bg-background-10/[0.03] border-background-50/50 dark:border-background-10/[0.06] hover:border-background-40 dark:hover:border-background-10/[0.15] hover:bg-background-60/60 dark:hover:bg-background-10/[0.05] transition-all duration-200'
              )}
            >
              <div className="flex flex-col gap-4 flex-grow">
                <div className="flex flex-grow flex-col gap-2 max-w-sm">
                  <div>
                    <Typography variant="section-title" bold>
                      {l10n.getString(
                        'onboarding-choose_mounting-manual_mounting'
                      )}
                    </Typography>
                  </div>
                  <div>
                    <Typography>
                      {l10n.getString(
                        'onboarding-choose_mounting-manual_mounting-description'
                      )}
                    </Typography>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  to="/onboarding/mounting/manual"
                  className="self-start mt-auto"
                  state={{ alonePage: state.alonePage }}
                  onClick={() => {
                    countMetric('mounting_choose', 1, {
                      attributes: { choose: 'manual' },
                    });
                  }}
                >
                  {l10n.getString(
                    'onboarding-automatic_mounting-manual_mounting'
                  )}
                </Button>
              </div>
            </div>
          </div>
          {!state.alonePage && (
            <OnboardingActions>
              <Button variant="secondary" to="/onboarding/trackers-assign">
                {l10n.getString('onboarding-previous_step')}
              </Button>
            </OnboardingActions>
          )}
        </OnboardingPanel>
      </OnboardingPage>
      <SkipSetupWarningModal
        accept={skipSetup}
        onClose={() => setShowWarning(false)}
        isOpen={showWarning}
      />
    </>
  );
}

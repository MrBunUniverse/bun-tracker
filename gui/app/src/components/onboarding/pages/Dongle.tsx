import { Localized } from '@fluent/react';
import { useOnboarding } from '@/hooks/onboarding';
import { Button } from '@/components/commons/Button';
import { Typography } from '@/components/commons/Typography';
import classNames from 'classnames';
import { USBIcon } from '@/components/commons/icon/UsbIcon';
import { WarningBox } from '@/components/commons/TipBox';
import {
  OnboardingActions,
  OnboardingPage,
  OnboardingPanel,
} from '@/components/onboarding/OnboardingPanel';
import { MoreSetsConfirm } from './quiz/MoreSetsConfirm';

export function DongleSectionContent() {
  const { state } = useOnboarding();

  return (
    <OnboardingPanel className="gap-6 min-w-0 overflow-hidden">
      <div className="flex gap-4 items-center">
        <div className="bg-accent-background-20/15 border border-accent-background-20/30 rounded-2xl p-3 text-background-10">
          <USBIcon size={28} />
        </div>
        <div>
          <Typography
            variant="main-title"
            id="onboarding-wifi_creds-dongle-title"
          />
        </div>
      </div>
      <div className={classNames('flex flex-col gap-4 flex-grow')}>
        <Typography
          whitespace="whitespace-pre-wrap"
          id="onboarding-wifi_creds-dongle-description"
        />
        <Localized id="onboarding-wifi_creds-dongle-wip">
          <WarningBox whitespace>WARNING</WarningBox>
        </Localized>
      </div>
      <OnboardingActions>
        {!state.alonePage ? (
          <Button
            variant="secondary"
            to={'/onboarding/quiz/slime-set'}
            id="onboarding-wifi_creds-back-v2"
          />
        ) : (
          <div />
        )}
        {state.alonePage && (
          <Button
            variant="primary"
            to={'/'}
            id="onboarding-wifi_creds-dongle-continue"
          />
        )}
        {!state.alonePage && <MoreSetsConfirm />}
      </OnboardingActions>
    </OnboardingPanel>
  );
}

export function DonglePage() {
  const { applyProgress } = useOnboarding();

  applyProgress(0.5);

  return (
    <OnboardingPage>
      <DongleSectionContent />
    </OnboardingPage>
  );
}

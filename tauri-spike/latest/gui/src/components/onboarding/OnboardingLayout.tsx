import { ReactNode, useState } from 'react';
import { useOnboarding } from '@/hooks/onboarding';
import { MainLayout } from '@/components/MainLayout';
import { TopBar } from '@/components/TopBar';
import { useBreakpoint } from '@/hooks/breakpoint';
import { RippleDots } from '@/components/commons/RippleDots';
import { SkipSetupButton } from './SkipSetupButton';
import { SkipSetupWarningModal } from './SkipSetupWarningModal';
import './OnboardingLayout.scss';

export function OnboardingLayout({ children }: { children: ReactNode }) {
  const { isMobile } = useBreakpoint('mobile');
  const { state, skipSetup } = useOnboarding();
  const [showWarning, setShowWarning] = useState(false);

  // The water ripple sits behind every setup step, and stays mounted while the steps change. In Bun only.
  return !state.alonePage ? (
    <div className="onboarding-layout relative isolate h-full">
      <RippleDots />
      <div style={{ gridArea: 't' }}>
        <TopBar progress={state.progress} />
      </div>
      <div style={{ gridArea: 'c' }} className="mt-2 relative">
        <div className="absolute top-12 mobile:top-0 right-2 z-50">
          <SkipSetupButton
            visible={true}
            modalVisible={showWarning}
            onClick={() => setShowWarning(true)}
          />
        </div>
        <div className="h-full w-full overflow-y-auto">{children}</div>
        <SkipSetupWarningModal
          accept={skipSetup}
          onClose={() => setShowWarning(false)}
          isOpen={showWarning}
        />
      </div>
    </div>
  ) : (
    <div className="relative isolate h-full">
      <RippleDots />
      <MainLayout isMobile={isMobile}>{children}</MainLayout>
    </div>
  );
}

import { ReactNode, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useOnboarding } from '@/hooks/onboarding';
import { MainLayout } from '@/components/MainLayout';
import { SetupStageNav } from './SetupStageNav';
import { useBreakpoint } from '@/hooks/breakpoint';
import { ContourDots } from '@/components/commons/ContourDots';
import { SkipSetupButton } from './SkipSetupButton';
import { SkipSetupWarningModal } from './SkipSetupWarningModal';
import './OnboardingLayout.scss';

export function OnboardingLayout({ children }: { children: ReactNode }) {
  const { isMobile } = useBreakpoint('mobile');
  const { state, skipSetup } = useOnboarding();
  const [showWarning, setShowWarning] = useState(false);
  const { pathname } = useLocation();
  const welcome = pathname === '/onboarding/home';
  // Body proportions keeps a plain background, so the skeleton view and tweaks stay uncluttered.
  const proportions = pathname.startsWith('/onboarding/body-proportions/');

  // Drifting pixel clouds behind the welcome tab and every setup step except body proportions. In Bun only.
  return !state.alonePage ? (
    <div className="onboarding-layout relative isolate h-full">
      {!proportions && <ContourDots />}
      {!welcome && (
        <div style={{ gridArea: 't' }}>
          <SetupStageNav />
        </div>
      )}
      <div
        style={{ gridArea: 'c' }}
        className={welcome ? 'relative' : 'mt-2 relative'}
      >
        {/* No skip on the welcome tab, so no ESC key there either. */}
        {pathname !== '/onboarding/home' && (
          <div className="absolute top-12 mobile:top-0 right-2 z-50">
            <SkipSetupButton
              visible={true}
              modalVisible={showWarning}
              onClick={() => setShowWarning(true)}
            />
          </div>
        )}
        {/* No text selection on setup pages, so dragging stirs the clouds instead. Fields stay selectable:
            WebKit will not take typing in an input whose user-select is none. */}
        <div className="h-full w-full overflow-y-auto select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text">
          {children}
        </div>
        <SkipSetupWarningModal
          accept={skipSetup}
          onClose={() => setShowWarning(false)}
          isOpen={showWarning}
        />
      </div>
    </div>
  ) : (
    <div className="relative isolate h-full">
      {!proportions && <ContourDots />}
      <MainLayout isMobile={isMobile}>{children}</MainLayout>
    </div>
  );
}

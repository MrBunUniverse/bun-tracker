import { lazy, Suspense, useEffect } from 'react';
import {
  HashRouter as Router,
  Navigate,
  Outlet,
  Route,
  Routes,
} from 'react-router-dom';
import { Home } from './components/home/Home';
import { MainLayout } from './components/MainLayout';
import { AppContextProvider } from './components/providers/AppContext';
import { GeneralSettings } from './components/settings/pages/GeneralSettings';
import { Serial } from './components/settings/pages/Serial';
import {
  ResumeSettings,
  SettingsLayout,
} from './components/settings/SettingsLayout';
import {
  useProvideWebsocketApi,
  WebSocketApiContext,
} from './hooks/websocket-api';

import { OnboardingContextProvider } from './components/onboarding/OnboardingContextProvider';
import { OnboardingLayout } from './components/onboarding/OnboardingLayout';
import { AutomaticProportionsPage } from './components/onboarding/pages/body-proportions/AutomaticProportions';
import { ManualProportionsPage } from './components/onboarding/pages/body-proportions/ManualProportions';
import { ConnectTrackersPage } from './components/onboarding/pages/ConnectTracker';
import { HomePage } from './components/onboarding/pages/Home';
import { AutomaticMountingPage } from './components/onboarding/pages/mounting/AutomaticMounting';
import { ManualMountingPage } from './components/onboarding/pages/mounting/ManualMounting';
import { TrackersAssignPage } from './components/onboarding/pages/trackers-assign/TrackerAssignment';
import { WifiCredsPage } from './components/onboarding/pages/WifiCreds';
import { DonglePage } from './components/onboarding/pages/Dongle';
import { ConfigContextProvider } from './components/providers/ConfigContext';
import { SerialDetectionModal } from './components/SerialDetectionModal';
import { VRCOSCSettings } from './components/settings/pages/VRCOSCSettings';
import { TrackerSettingsPage } from './components/tracker/TrackerSettings';
import { OSCRouterSettings } from './components/settings/pages/OSCRouterSettings';
import { VMCSettings } from './components/settings/pages/VMCSettings';
import { MountingChoose } from './components/onboarding/pages/mounting/MountingChoose';
import { useBreakpoint } from './hooks/breakpoint';
import { VRModePage } from './components/vr-mode/VRModePage';
import { InterfaceSettings } from './components/settings/pages/InterfaceSettings';
import { error, log } from './utils/logging';
import { AppLayout } from './AppLayout';
import { Preload } from './components/Preload';
import { UnknownDeviceModal } from './components/UnknownDeviceModal';
import { useDiscordPresence } from './hooks/discord-presence';
import { audioFeedback } from './utils/audio-feedback';
import { ResetRequestT, ResetType, RpcMessage } from 'solarxr-protocol';
import { ScaledProportionsPage } from './components/onboarding/pages/body-proportions/ScaledProportions';
import { AdvancedSettings } from './components/settings/pages/AdvancedSettings';
import { UserAgreementSettings } from './components/settings/pages/UserAgreementSettings';
import { FirmwareUpdate } from './components/firmware-update/FirmwareUpdate';
import { ConnectionLost } from './components/onboarding/pages/ConnectionLost';
import { VRCWarningsPage } from './components/vrc/VRCWarningsPage';
import { StayAlignedSetup } from './components/onboarding/pages/stay-aligned/StayAlignedSetup';
import { TrackingChecklistProvider } from './components/tracking-checklist/TrackingChecklistProvider';
import { HomeScreenSettings } from './components/settings/pages/HomeScreenSettings';
import { SpecialThemesSettings } from './components/settings/pages/SpecialThemesSettings';
import { ChecklistPage } from './components/tracking-checklist/TrackingChecklist';
import { QuizSlimeSetQuestion } from './components/onboarding/pages/quiz/SlimeSetQuestion';
import { QuizUsageQuestion } from './components/onboarding/pages/quiz/UsageQuestion';
import { QuizRuntimeQuestion } from './components/onboarding/pages/quiz/RuntimeQuestion';
import { QuizMocapPosQuestion } from './components/onboarding/pages/quiz/MocapPreferencesQuestions';
import { ElectronContextC, provideElectron } from './hooks/electron';
import { AppLocalizationProvider } from './i18n/config';
import { openUrl } from './hooks/crossplatform';
import { UdevRulesModal } from './components/onboarding/UdevRulesModal';

export const DOCS_SITE = 'https://docs.slimevr.dev';

const FirmwareToolSettings = lazy(() =>
  import('./components/firmware-tool/FirmwareTool').then((module) => ({
    default: module.FirmwareToolSettings,
  }))
);
const RemotePage = lazy(() =>
  import('./components/remote/RemotePage').then((module) => ({
    default: module.RemotePage,
  }))
);

function Layout() {
  const { isMobile } = useBreakpoint('mobile');
  useDiscordPresence();

  return (
    <>
      <SerialDetectionModal />
      <UnknownDeviceModal />
      <UdevRulesModal />
      <Suspense fallback={null}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route
              path="/"
              element={
                <MainLayout isMobile={isMobile} full flush>
                  <Home />
                </MainLayout>
              }
            />
            <Route
              path="/remote"
              element={
                <MainLayout isMobile={isMobile}>
                  <RemotePage />
                </MainLayout>
              }
            />
            <Route
              path="/firmware-update"
              element={
                <MainLayout isMobile={isMobile}>
                  <FirmwareUpdate />
                </MainLayout>
              }
            />
            <Route
              path="/vr-mode"
              element={
                <MainLayout isMobile={isMobile} full>
                  <VRModePage />
                </MainLayout>
              }
            />
            <Route
              path="/checklist"
              element={
                <MainLayout isMobile={isMobile}>
                  <ChecklistPage />
                </MainLayout>
              }
            />
            <Route
              path="/tracker/:trackernum/:deviceid"
              element={
                <MainLayout background={false} isMobile={isMobile}>
                  <TrackerSettingsPage />
                </MainLayout>
              }
            />
            <Route
              path="/vrc-warnings"
              element={
                <MainLayout isMobile={isMobile}>
                  <VRCWarningsPage />
                </MainLayout>
              }
            />
            <Route
              path="/settings"
              element={
                <SettingsLayout>
                  <Outlet />
                </SettingsLayout>
              }
            >
              <Route index element={<ResumeSettings />} />
              <Route
                path="vrchat"
                element={<Navigate to="/settings/osc/vrchat" replace />}
              />
              <Route path="firmware-tool" element={<FirmwareToolSettings />} />
              <Route path="trackers" element={<GeneralSettings />} />
              <Route path="serial" element={<Serial />} />
              <Route path="osc/router" element={<OSCRouterSettings />} />
              <Route path="osc/vrchat" element={<VRCOSCSettings />} />
              <Route path="osc/vmc" element={<VMCSettings />} />
              <Route path="interface" element={<InterfaceSettings />} />
              <Route path="interface/home" element={<HomeScreenSettings />} />
              <Route
                path="special-themes"
                element={<SpecialThemesSettings />}
              />
              {/* Retired page; old links and bookmarks land on the saved/default section. */}
              <Route
                path="quest-capture"
                element={<Navigate to="/settings" replace />}
              />
              <Route path="advanced" element={<AdvancedSettings />} />
              <Route
                path="user-agreement"
                element={<UserAgreementSettings />}
              />
            </Route>
            <Route
              path="/onboarding"
              element={
                <OnboardingLayout>
                  <Outlet />
                </OnboardingLayout>
              }
            >
              <Route path="home" element={<HomePage />} />
              <Route path="wifi-creds" element={<WifiCredsPage />} />
              <Route path="quiz/slime-set" element={<QuizSlimeSetQuestion />} />
              <Route path="quiz/usage" element={<QuizUsageQuestion />} />
              <Route path="quiz/runtime" element={<QuizRuntimeQuestion />} />
              <Route path="quiz/mocap-pos" element={<QuizMocapPosQuestion />} />
              <Route path="dongle" element={<DonglePage />} />
              <Route path="firmware-tool" element={<FirmwareToolSettings />} />
              <Route
                path="connect-trackers"
                element={<ConnectTrackersPage />}
              />
              <Route path="trackers-assign" element={<TrackersAssignPage />} />
              <Route path="mounting/choose" element={<MountingChoose />} />
              <Route path="mounting/auto" element={<AutomaticMountingPage />} />
              <Route path="mounting/manual" element={<ManualMountingPage />} />
              <Route
                path="body-proportions/auto"
                element={<AutomaticProportionsPage />}
              />
              <Route
                path="body-proportions/manual"
                element={<ManualProportionsPage />}
              />
              <Route
                path="body-proportions/scaled"
                element={<ScaledProportionsPage />}
              />
              <Route path="stay-aligned" element={<StayAlignedSetup />} />
            </Route>
            <Route path="*" element={null} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}

export default function App() {
  const websocketAPI = useProvideWebsocketApi();
  const electron = provideElectron();

  useEffect(() => {
    const onKeydown: (arg0: KeyboardEvent) => void = function (event) {
      // prevent search bar keybind
      if (
        event.key === 'F3' ||
        (event.ctrlKey && event.key === 'f') ||
        (event.metaKey && event.key === 'f')
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, []);

  if (electron.isElectron) {
    useEffect(() => {
      const unlisten = electron.api.onServerStatus(({ type, message }) => {
        if (type === 'stderr') {
          // This strange invocation is what lets us lose the line information in the console
          // See more here: https://stackoverflow.com/a/48994308
          // These two are fine to keep with console.log, they are server logs
          setTimeout(
            console.log.bind(
              console,
              `%c[SERVER] %c${message}`,
              'color:cyan',
              'color:red'
            )
          );
        } else if (type === 'stdout') {
          setTimeout(
            console.log.bind(
              console,
              `%c[SERVER] %c${message}`,
              'color:cyan',
              'color:green'
            )
          );
        } else if (type === 'error') {
          error('Error: %s', message);
        } else if (type === 'terminated') {
          error('Server Process Terminated: %s', message);
        } else if (type === 'other') {
          log('Other process event: %s', message);
        }
      });

      return () => {
        unlisten();
      };
    }, []);

    useEffect(() => {
      const u1 = electron.api.onTrayReset?.((type) => {
        const req = new ResetRequestT();
        req.resetType =
          type === 'yaw'
            ? ResetType.Yaw
            : type === 'full'
              ? ResetType.Full
              : ResetType.Mounting;
        websocketAPI.sendRPCPacket(RpcMessage.ResetRequest, req);
      });

      const u2 = electron.api.onTrayElevationStep?.((delta) => {
        audioFeedback.playStepClick(delta > 0);
        window.dispatchEvent(
          new CustomEvent('tray-elevation-delta', { detail: delta })
        );
      });

      const u3 = electron.api.onTrayElevationReset?.(() => {
        audioFeedback.playStepClick(false);
        window.dispatchEvent(new CustomEvent('tray-elevation-reset-event'));
      });

      return () => {
        u1?.();
        u2?.();
        u3?.();
      };
    }, [websocketAPI]);
  }

  useEffect(() => {
    function onKeyboard(ev: KeyboardEvent) {
      if (ev.key === 'F1') {
        return openUrl(DOCS_SITE);
      }
    }

    document.addEventListener('keyup', onKeyboard);
    return () => document.removeEventListener('keyup', onKeyboard);
  }, []);

  return (
    <ElectronContextC.Provider value={electron}>
      <AppLocalizationProvider>
        <Router>
          <ConfigContextProvider>
            <WebSocketApiContext.Provider value={websocketAPI}>
              <AppContextProvider>
                <OnboardingContextProvider>
                  <TrackingChecklistProvider>
                    <div className="h-full w-full text-standard bg-background-80 text-background-10">
                      <Preload />
                      {!websocketAPI.isConnected && <ConnectionLost />}
                      {websocketAPI.isConnected && <Layout />}
                    </div>
                  </TrackingChecklistProvider>
                </OnboardingContextProvider>
              </AppContextProvider>
            </WebSocketApiContext.Provider>
          </ConfigContextProvider>
        </Router>
      </AppLocalizationProvider>
    </ElectronContextC.Provider>
  );
}

import { createContext, lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter as Router, Outlet, Route, Routes } from 'react-router-dom';
import { MainLayout } from './components/MainLayout';
import { AppContextProvider } from './components/providers/AppContext';
import { SettingsLayout } from './components/settings/SettingsLayout';
import {
  useProvideWebsocketApi,
  WebSocketApiContext,
} from './hooks/websocket-api';

import { OnboardingContextProvider } from './components/onboarding/OnboardingContextProvider';
import { OnboardingLayout } from './components/onboarding/OnboardingLayout';
import { ConfigContextProvider } from './components/providers/ConfigContext';
import { SerialDetectionModal } from './components/SerialDetectionModal';
import { VersionUpdateModal } from './components/VersionUpdateModal';
import semver from 'semver';
import { useBreakpoint } from './hooks/breakpoint';
import { error, log } from './utils/logging';
import { AppLayout } from './AppLayout';
import { Preload } from './components/Preload';
import { UnknownDeviceModal } from './components/UnknownDeviceModal';
import { useDiscordPresence } from './hooks/discord-presence';
import { withSentryReactRouterV6Routing } from '@sentry/react';
import { ConnectionLost } from './components/onboarding/pages/ConnectionLost';
import { TrackingChecklistProvider } from './components/tracking-checklist/TrackingChecklistProvider';
import { ElectronContextC, provideElectron } from './hooks/electron';
import { AppLocalizationProvider } from './i18n/config';
import { openUrl } from './hooks/crossplatform';
import { UdevRulesModal } from './components/onboarding/UdevRulesModal';

// Pages are lazy-loaded so the initial bundle only has what the connection screen needs.
// Before this, the whole app (about 5.5 MB of JavaScript) loaded on every start.
const Home = lazy(() =>
  import('./components/home/Home').then((m) => ({ default: m.Home }))
);
const FirmwareUpdate = lazy(() =>
  import('./components/firmware-update/FirmwareUpdate').then((m) => ({
    default: m.FirmwareUpdate,
  }))
);
const VRModePage = lazy(() =>
  import('./components/vr-mode/VRModePage').then((m) => ({
    default: m.VRModePage,
  }))
);
const ChecklistPage = lazy(() =>
  import('./components/tracking-checklist/TrackingChecklist').then((m) => ({
    default: m.ChecklistPage,
  }))
);
const TrackerSettingsPage = lazy(() =>
  import('./components/tracker/TrackerSettings').then((m) => ({
    default: m.TrackerSettingsPage,
  }))
);
const VRCWarningsPage = lazy(() =>
  import('./components/vrc/VRCWarningsPage').then((m) => ({
    default: m.VRCWarningsPage,
  }))
);
const TopBar = lazy(() =>
  import('./components/TopBar').then((m) => ({ default: m.TopBar }))
);
const FirmwareToolSettings = lazy(() =>
  import('./components/firmware-tool/FirmwareTool').then((m) => ({
    default: m.FirmwareToolSettings,
  }))
);
const GeneralSettings = lazy(() =>
  import('./components/settings/pages/GeneralSettings').then((m) => ({
    default: m.GeneralSettings,
  }))
);
const Serial = lazy(() =>
  import('./components/settings/pages/Serial').then((m) => ({
    default: m.Serial,
  }))
);
const OSCRouterSettings = lazy(() =>
  import('./components/settings/pages/OSCRouterSettings').then((m) => ({
    default: m.OSCRouterSettings,
  }))
);
const VRCOSCSettings = lazy(() =>
  import('./components/settings/pages/VRCOSCSettings').then((m) => ({
    default: m.VRCOSCSettings,
  }))
);
const VMCSettings = lazy(() =>
  import('./components/settings/pages/VMCSettings').then((m) => ({
    default: m.VMCSettings,
  }))
);
const InterfaceSettings = lazy(() =>
  import('./components/settings/pages/InterfaceSettings').then((m) => ({
    default: m.InterfaceSettings,
  }))
);
const HomeScreenSettings = lazy(() =>
  import('./components/settings/pages/HomeScreenSettings').then((m) => ({
    default: m.HomeScreenSettings,
  }))
);
const AdvancedSettings = lazy(() =>
  import('./components/settings/pages/AdvancedSettings').then((m) => ({
    default: m.AdvancedSettings,
  }))
);
const HomePage = lazy(() =>
  import('./components/onboarding/pages/Home').then((m) => ({
    default: m.HomePage,
  }))
);
const ErrorCollectingConsentPage = lazy(() =>
  import('./components/onboarding/pages/ErrorCollectingConsent').then((m) => ({
    default: m.ErrorCollectingConsentPage,
  }))
);
const WifiCredsPage = lazy(() =>
  import('./components/onboarding/pages/WifiCreds').then((m) => ({
    default: m.WifiCredsPage,
  }))
);
const QuizSlimeSetQuestion = lazy(() =>
  import('./components/onboarding/pages/quiz/SlimeSetQuestion').then((m) => ({
    default: m.QuizSlimeSetQuestion,
  }))
);
const QuizUsageQuestion = lazy(() =>
  import('./components/onboarding/pages/quiz/UsageQuestion').then((m) => ({
    default: m.QuizUsageQuestion,
  }))
);
const QuizRuntimeQuestion = lazy(() =>
  import('./components/onboarding/pages/quiz/RuntimeQuestion').then((m) => ({
    default: m.QuizRuntimeQuestion,
  }))
);
const QuizMocapPosQuestion = lazy(() =>
  import('./components/onboarding/pages/quiz/MocapPreferencesQuestions').then(
    (m) => ({ default: m.QuizMocapPosQuestion })
  )
);
const DonglePage = lazy(() =>
  import('./components/onboarding/pages/Dongle').then((m) => ({
    default: m.DonglePage,
  }))
);
const ConnectTrackersPage = lazy(() =>
  import('./components/onboarding/pages/ConnectTracker').then((m) => ({
    default: m.ConnectTrackersPage,
  }))
);
const TrackersAssignPage = lazy(() =>
  import('./components/onboarding/pages/trackers-assign/TrackerAssignment').then(
    (m) => ({ default: m.TrackersAssignPage })
  )
);
const MountingChoose = lazy(() =>
  import('./components/onboarding/pages/mounting/MountingChoose').then((m) => ({
    default: m.MountingChoose,
  }))
);
const AutomaticMountingPage = lazy(() =>
  import('./components/onboarding/pages/mounting/AutomaticMounting').then(
    (m) => ({ default: m.AutomaticMountingPage })
  )
);
const ManualMountingPage = lazy(() =>
  import('./components/onboarding/pages/mounting/ManualMounting').then((m) => ({
    default: m.ManualMountingPage,
  }))
);
const AutomaticProportionsPage = lazy(() =>
  import('./components/onboarding/pages/body-proportions/AutomaticProportions').then(
    (m) => ({ default: m.AutomaticProportionsPage })
  )
);
const ManualProportionsPage = lazy(() =>
  import('./components/onboarding/pages/body-proportions/ManualProportions').then(
    (m) => ({ default: m.ManualProportionsPage })
  )
);
const ScaledProportionsPage = lazy(() =>
  import('./components/onboarding/pages/body-proportions/ScaledProportions').then(
    (m) => ({ default: m.ScaledProportionsPage })
  )
);
const StayAlignedSetup = lazy(() =>
  import('./components/onboarding/pages/stay-aligned/StayAlignedSetup').then(
    (m) => ({ default: m.StayAlignedSetup })
  )
);

export const GH_REPO = 'SlimeVR/SlimeVR-Server';
export const VersionContext = createContext('');
export const DOCS_SITE = 'https://docs.slimevr.dev';
export const SLIMEVR_DISCORD = 'https://discord.gg/slimevr';

const SentryRoutes = withSentryReactRouterV6Routing(Routes);

function Layout() {
  const { isMobile } = useBreakpoint('mobile');
  useDiscordPresence();

  return (
    <>
      <SerialDetectionModal />
      <VersionUpdateModal />
      <UnknownDeviceModal />
      <UdevRulesModal />
      <Suspense fallback={null}>
        <SentryRoutes>
          <Route element={<AppLayout />}>
            <Route
              path="/"
              element={
                <MainLayout isMobile={isMobile} full>
                  <Home />
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
              <Route path="firmware-tool" element={<FirmwareToolSettings />} />
              <Route path="trackers" element={<GeneralSettings />} />
              <Route path="serial" element={<Serial />} />
              <Route path="osc/router" element={<OSCRouterSettings />} />
              <Route path="osc/vrchat" element={<VRCOSCSettings />} />
              <Route path="osc/vmc" element={<VMCSettings />} />
              <Route path="interface" element={<InterfaceSettings />} />
              <Route path="interface/home" element={<HomeScreenSettings />} />
              <Route path="advanced" element={<AdvancedSettings />} />
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
              <Route
                path="error-collecting-consent"
                element={<ErrorCollectingConsentPage />}
              />
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
            <Route path="*" element={<TopBar />} />
          </Route>
        </SentryRoutes>
      </Suspense>
    </>
  );
}

export default function App() {
  const websocketAPI = useProvideWebsocketApi();
  const [updateFound, setUpdateFound] = useState('');
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

  useEffect(() => {
    // don't show update stuff when on android
    if (window.__ANDROID__?.isThere()) return;

    if (!semver.valid(__VERSION_TAG__)) {
      log(
        { version: __VERSION_TAG__ || 'development' },
        'Non semver version, skipping the server update check'
      );
      return;
    }

    async function fetchReleases() {
      const releases = await fetch(
        `https://api.github.com/repos/${GH_REPO}/releases`
      )
        .then((res) => res.json())
        .catch(() => null)
        .then((json: any[]) => json.filter((rl) => rl?.prerelease === false));

      if (!releases) return;

      if (typeof releases[0].tag_name !== 'string') return;

      const version = semver.coerce(releases[0].tag_name);

      if (version && semver.gt(version, __VERSION_TAG__)) {
        setUpdateFound(releases[0].tag_name);
      }
    }
    fetchReleases().catch((e) => error(e, 'failed to fetch releases'));
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
                    <VersionContext.Provider value={updateFound}>
                      <div className="h-full w-full text-standard bg-background-80 text-background-10">
                        <Preload />
                        {!websocketAPI.isConnected && <ConnectionLost />}
                        {websocketAPI.isConnected && <Layout />}
                      </div>
                    </VersionContext.Provider>
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

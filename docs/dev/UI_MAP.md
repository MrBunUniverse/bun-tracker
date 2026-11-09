# UI Map

Locator for GUI work. Paths are relative to `gui/app/`. Entries name files and symbols, not line numbers: open the file and `rg` the symbol. Update this map when a component moves, is renamed, or changes responsibility.

Routes are defined in `src/App.tsx`. Design direction is in `docs/dev/DESIGN.md`.

## Shell and chrome

| Element | File | Notes |
| --- | --- | --- |
| Route wrapper, skip link, shortcuts | `src/components/shell/AppShell.tsx` | Cmd/Ctrl+1..5 jump pages |
| Top navigation | `src/components/shell/TopNav.tsx`, `shell/nav-routes.ts`, `shell/nav-items.tsx` | `TopNav`, `MoreMenu`, `AppActionsMenu` (reload interface and restart server); destinations and overflow rules in `nav-routes`, icons in `nav-items` |
| Title bar | `src/components/shell/TopNav.tsx` | Right end of the nav row: update download, `VersionTag`, app actions, `shell/WindowControls.tsx` (the old `TopBar` is gone) |
| Status bar | `src/components/shell/StatusBar.tsx`, `shell/status-bar-mode.ts` | Bottom bar with the five status pills; Desk/VR size switch (localStorage); popovers open upward via `hooks/top-bar-popover.ts` |
| Connection status popover | `src/components/shell/StatusCluster.tsx` | Server, mode, trackers, Mac IP, headset address, scan |
| Other shell controls | `src/components/shell/{QuestTargetIPPill,RefreshTrackersButton,VersionTag}.tsx` | |
| Native shell | `../tauri/src/main.rs`, `../tauri/shim/electron-shim.js`, `../shared/electron-api.ts` | Tauri commands, the `window.electronAPI` shim, its types |
| Layouts | `src/components/MainLayout.tsx` (+ `.scss`), `EmptyLayout.tsx`, `src/AppLayout.tsx` | Grid shell for main routes |
| Broadcast / VRChat chatbox | `src/components/broadcast/ChatboxDropdown.tsx` (+ `.scss`) | Voice, sticky, music, BPM tabs; battery broadcast |
| Reset toolbar | `src/components/Toolbar.tsx` | `Toolbar`, `ResetActionsGroup`, `BasicResetButton` |
| App-level modals | `src/components/{SerialDetectionModal,UnknownDeviceModal,VersionUpdateModal,TrackersStillOnModal,TrayOrExitModal}.tsx` | |

## Home (`/`)

| Element | File | Notes |
| --- | --- | --- |
| Page, card/table switch, inspector toggle, demo badge, quiet dashboard clouds behind the card grid (paw themes) | `src/components/home/Home.tsx` | `Home` |
| Tracker grid card | `src/components/home/HomeEmptyState.tsx` | `ClaudeTrackerWindowCard`: problem chip (High ping), offline card dimmed and greyed, compact battery row (outlined icon with fill and %; percent clamp in `src/utils/battery-cells.ts`), banner, body icon, IMU preview; top-lit motion rim (`useMotionGlow` in `src/hooks/tracker.ts`, envelope and the demo scene `sampleDemoScene` (icon pose, shade and rim from one clock) in `src/utils/motion-envelope.ts`, `.tracker-motion-rim` in `src/index.scss`, reddened below 50% battery by `batteryRedness`) |
| Empty state, setup links, demo mode | `src/components/home/HomeEmptyState.tsx` | `TrackerEmptyState`, `SETUP_STEPS`, `SETUP_LINKS`, `HomeEmptyState` |
| Presets | `src/components/home/PresetSelector.tsx` | |
| Quest diagnostics | `src/components/home/QuestDiagnosticsCard.tsx`, `QuestDiagnosticsPill.tsx` | Card and compact pill |
| Reset button | `src/components/home/ResetButton.tsx` | Countdown button |
| Home settings modal | `src/components/home/HomeSettingsModal.tsx` | |
| Inspector (right column) | `src/components/Sidebar.tsx` | `Sidebar`, `PreviewSection`, `PreviewControls`; Preview and Checklist tabs |
| 3D skeleton / IMU canvases | `src/components/widgets/SkeletonVisualizerWidget.tsx`, `IMUVisualizerWidget.tsx` | Three.js |

## Trackers (`/tracker/:trackernum/:deviceid`)

| Element | File | Notes |
| --- | --- | --- |
| Table view | `src/components/tracker/TrackersTable.tsx` (+ `.scss`) | `TrackerNameCell`, `Header`, `Cell`, `Row` |
| Status pill | `src/components/tracker/TrackerStatus.tsx` | `statusClassMap` holds dot colors |
| Battery, Wi-Fi | `src/components/tracker/TrackerBattery.tsx`, `TrackerWifi.tsx` | |
| Detail page | `src/components/tracker/TrackerSettings.tsx` | Hero header (status, battery, signal), panel grid: live 3D preview, assignment, name, firmware, device info, connection, drift |
| Assignment menu | `src/components/tracker/SingleTrackerBodyAssignmentMenu.tsx` | |
| Legacy cards (onboarding) | `src/components/tracker/TrackerCard.tsx`, `TrackerPartCard.tsx` | |
| Body part icons | `src/components/commons/BodyPartIcon.tsx`, `commons/icon/<Part>Icon.tsx` | `mapPart` maps `BodyPart` to icon; resize via each icon's `viewBox` |

## Remote and Quest (toolbar popout; `/remote` compatibility route)

| Element | File | Notes |
| --- | --- | --- |
| Remote toolbar popout | `src/components/remote/RemotePopover.tsx`, `RemotePage.tsx`, `streamcast-model.ts`, `src/hooks/streamcast.ts` | Compact Quest StreamCast control panel: connection header, headset row, Start/Stop, game audio and mic cards, diagnostics |
| Native side | `gui/tauri/src/streamcast.rs`, `streamCast` in `gui/tauri/shim/electron-shim.js` | Control socket to the Quest StreamCast app, which owns capture; see `docs/fork/CUSTOM.md` |

## Settings (`/settings/...`)

| Element | File | Notes |
| --- | --- | --- |
| Layout and sidebar | `src/components/settings/SettingsLayout.tsx` (+ `.scss`), `SettingsPageLayout.tsx`, `SettingsSidebar.tsx` | |
| Pages | `src/components/settings/pages/{GeneralSettings,InterfaceSettings,HomeScreenSettings,VRCOSCSettings,OSCRouterSettings,VMCSettings,Serial,AdvancedSettings}.tsx` | `GeneralSettings` is very long; `rg` the section. `HomeScreenSettings` holds only Tracking checklist; the Home layout picker lives on Home |
| Stay Aligned | `src/components/settings/pages/components/StayAlignedSettings.tsx`, `StayAlignedPoseModal.tsx` | |
| Magnetometer toggle | `src/components/settings/pages/MagnetometerToggleSetting.tsx` | |
| Modals | `src/components/settings/SettingsResetModal.tsx`, `HandsWarningModal.tsx` | |
| Firmware tool | `src/components/firmware-tool/FirmwareTool.tsx`, `DeviceCard.tsx`, `steps/` | |

## Onboarding (`/onboarding/...`)

| Element | File | Notes |
| --- | --- | --- |
| Layout | `src/components/onboarding/OnboardingLayout.tsx` | Wizard shell: clouds, `SetupStageNav` row (no TopBar), skip/ESC |
| Stage navigator | `src/components/onboarding/SetupStageNav.tsx` | One compact row to open any setup stage (chips, or Jump-to-step select when narrow) |
| Stage routing | `src/components/onboarding/setup-stages.ts` | Pure: stages per tracker type, route to stage, neighbours (tested in `tests/setup-stages.test.ts`) |
| Intro, Wi-Fi, dongle, connect | `src/components/onboarding/pages/{Home,WifiCreds,Dongle,ConnectTracker}.tsx` | |
| Step page frame, panel, actions row | `src/components/onboarding/OnboardingPanel.tsx` | `OnboardingPage`, `OnboardingPanel`, `OnboardingActions`; shared by steps 1-5 and 7 |
| Quiz | `src/components/onboarding/pages/quiz/` | `SlimeSetQuestion.tsx` and peers |
| Assignment | `src/components/onboarding/pages/trackers-assign/{TrackerAssignment,TrackerSelectionMenu}.tsx`, `onboarding/BodyAssignment.tsx` | |
| Mounting | `src/components/onboarding/pages/mounting/{MountingChoose,AutomaticMounting,ManualMounting,MountingSelectionMenu}.tsx` | Shared logic in `src/hooks/manual-mounting.ts` |
| Proportions | `src/components/onboarding/pages/body-proportions/{BodyProportions,AutomaticProportions,ManualProportions,ScaledProportions,HeightInput}.tsx` | Manual rows (`useRowHighlight`) light their bones in the page's preview on hover/focus/touch; row to bone mapping in `src/utils/proportion-highlight.ts`, drawn by `BasedSkeletonHelper.setHighlight`; ManualProportions stacks preview over controls under 900px with a draggable/keyboard separator, sizing rules in `src/utils/pane-split.ts` (height saved as `slimevr-manual-preview-height`); Auto-orbit and Auto-frame toggles sit in the preview's bottom-right corner; clicking a bone there (`setBonePick`, `rowForPart`) scrolls to and flashes its row, home preview excluded |
| Modals | `src/components/onboarding/{SkipSetupWarningModal,UdevRulesModal,NeckWarningModal}.tsx` | |

## Checklist and VRChat

| Element | File |
| --- | --- |
| Tracking checklist | `src/components/tracking-checklist/{TrackingChecklist,TrackingChecklistModal,TrackingChecklistProvider}.tsx` |
| VRChat warnings | `src/components/vrc/VRCWarningsPage.tsx` |

## Shared primitives

All in `src/components/commons/`: `Button`, `IconButton`, `SegmentedControl`, `StatusDot`, `Typography`, `Input`, `Dropdown`, `Checkbox`, `Radio`, `Toggle`, `Range`, `Slider`, `NumberSelector` (step buttons plus a slider for fixed-step numeric values), `SettingRow`, `TipBox` (also exports the warning box), `Tooltip`, `BaseModal`, `Modal`, `ButtonConfirmModal`, `ProgressBar`, `VerticalStepper`, `LangSelector`, `BodyDisplay`, `BodyInteractions`.

`IconButton` requires an accessible name. Status is never conveyed by color alone.

## Tokens and theming

| Area | File | Notes |
| --- | --- | --- |
| CSS tokens, glass classes, themes | `src/index.scss` | `:root[data-theme='bun'|'fox'|'dog']` blocks (`hooks/theme.ts` lists them and normalizes retired saved themes to Bun), `.glass-panel`, `.glass-pill`, focus ring |
| Tailwind scales | `tailwind.config.ts` | `background-*`, `accent-background-*`, `text-ui-*` |
| Contrast gate | `scripts/check-contrast.mjs` | `pnpm run check:contrast` |
| Strings | `public/i18n/en/translation.ftl` | Fluent; add keys here for new UI text |

## State and hooks

| Name | File | Purpose |
| --- | --- | --- |
| Jotai atoms | `src/store/app-store.ts` | Devices, trackers, assignment, sidebar |
| Demo trackers | `src/store/demo-trackers.ts` | Simulated data for demo mode |
| `useWebsocketAPI` | `src/hooks/websocket-api.ts` | RPC and data feed to the server |
| `useAppContext` | `src/hooks/app.ts` | Global app state |
| `useConfig` | `src/hooks/config.ts` | User config |
| `useTracker` | `src/hooks/tracker.ts` | Name, velocity, status helpers |
| `useReset` | `src/hooks/reset.ts` | Yaw/Full/Mounting countdown logic |
| `usePresets` | `src/hooks/presets.ts` | Preset load/save/switch |
| `useOnboarding` | `src/hooks/onboarding.ts` | Wizard state |
| Operating mode, layout | `src/hooks/operating-mode.ts`, `layout.ts` | |
| Audio feedback | `src/utils/audio-feedback.ts` | Countdown beeps, reset chime |

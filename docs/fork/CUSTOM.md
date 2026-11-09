# Custom feature inventory

What this fork adds to or changes from upstream SlimeVR. Check this list before resolving a merge conflict, so custom behavior is not dropped. Update it when a feature is added, removed, or disabled. Pins and the merge workflow are in [UPSTREAM.md](UPSTREAM.md).

## Desktop app

| Feature | Location | Notes |
| --- | --- | --- |
| Tauri shell | `gui/tauri/` | Replaces the upstream Electron host. Keeps the bundle identifier `dev.slimevr.tauri-spike` and its storage location. |
| Native API contract | `gui/shared/electron-api.ts`, `gui/tauri/shim/electron-shim.js` | The name `window.electronAPI` is kept on purpose, so the frontend matches upstream. |
| Redesigned interface | `gui/app/src/` | Navy, gray and amber theme, top bar, tracker cards, settings and broadcast controls. See `docs/dev/DESIGN.md`. |
| Special themes | `gui/app/src/index.scss`, `docs/dev/THEMES.md` | Bun, Fox and Dog share the PawPad layout. |
| Launcher | `Start SlimeVR.command`, `tools/launcher-tests/` | Owns Vite for hot reload and stops only what its window started. |
| ESP32 USB dongle | `tools/esp32-dongle/` | Tracker receiver over USB. The launcher and the Dongle popup start `bridge.py`. |
| VRChat chatbox tools | `gui/app/src/components/broadcast/` | Chatbox, Apple Music, BPM and dictation. |

## Server

Custom classes under `server/core/src/main/java/dev/slimevr/`, with their settings in `config/` (`QuestStandaloneConfig`, `TelemetryConfig`, and added fields in `FiltersConfig`, `LegTweaksConfig`, `ResetsConfig`, `ServerConfig`, `StayAlignedConfig`, `TrackerConfig`, `VRConfig`).

| Feature | Location |
| --- | --- |
| Adaptive drift compensation | `tracking/trackers/AdaptiveDriftCompensation.kt`, `tracking/processor/stayaligned/AdaptiveKineticPosture.kt` |
| Pose stability estimate | `tracking/trackers/PoseStabilityEstimator.kt` |
| Tracker recovery states | `tracking/trackers/TrackerRecoveryHandler.kt`, `tracking/trackers/TrackerSample.kt` |
| UDP connection registry | `tracking/trackers/udp/UDPConnectionRegistry.kt` |
| Playout buffer | `filtering/PlayoutBuffer.kt` |
| Automatic full reset | `reset/AutoFullReset.kt` |
| Zero-slide foot clamp | `tracking/processor/skeleton/ZeroSlideFootClamp.kt` |
| Tracker telemetry | `tracking/telemetry/TrackerTelemetryLogger.kt` |
| WebSocket API boundary | `websocketapi/WebsocketAPI.java`: loopback by default, `websocketApiAllowRemote` opt-in |

## Protocol

`solarxr-protocol/` is the only protocol source, on the `sj-custom` branch of SJ-SolarXR-Protocol. It adds two commits to upstream: `osc_rate` on SkeletonHeight, and the tracker recovery, adaptive drift and filter health schemas. Gradle and the frontend both build from it.

## Disabled native capabilities

The frontend calls these, but the Tauri shell does not provide them yet. The frontend reports each one as unavailable. The Electron versions are in git history at commit `7ce72074`, under `tauri-spike/latest/gui/electron/main/`.

| Capability | Contract member | Current behavior |
| --- | --- | --- |
| Mac built-in dictation | `transcribeNativeSpeech`, `requestMicrophoneAccess` | Dictation says Mac speech is unavailable and points to Groq. |
| Tray actions | `onTrayReset`, `onTrayElevationStep`, `onTrayElevationReset` | No tray yet. `tauri` is built without `tray-icon`. |
| Discord presence | `setPresence` | No-op in the shim. |
| Server status stream | `onServerStatus` | No-op. The launcher runs the server separately. |
| Window decorations, tray translations | `showDecorations`, `setTranslations` | No-op. |
| Steam detection | `isSteam` | Always false. |

Known gaps that are not contract members:

- The udev rules file `gui/tauri/resources/69-slimevr-devices.rules` is not placed in the app's install directory, which is where `UdevRulesModal` reads it.
- `flake.nix` still describes the Electron build (`pkgs.electron`, electron-builder, `ELECTRON_*`). It has not been validated against the Tauri app, so treat the Nix shell as unverified.

### Quest streaming

Quest capture lives in the separate Quest StreamCast app, not in this repository. The old in-app Quest capture settings page was removed; `/settings/quest-capture` redirects to Settings. The Remote page is a control panel for it; video, audio engines and advanced settings stay in that app, so nothing here starts `adb` or `scrcpy`.

`gui/tauri/src/streamcast.rs` talks to the app over `~/Library/Application Support/QuestStreamCast/control/control.sock`, a per-user Unix socket with one JSON line each way. Commands are a closed list. The protocol number is `PROTOCOL` there, `SUPPORTED_PROTOCOL` in `RemotePage.tsx`, and `ControlBridge.version` in StreamCast; change them together. Leaving the page or quitting SlimeVR sends nothing, so a running stream continues.

## Removed from upstream

- The Electron host and packaging. Restore from commit `7ce72074`.
- Unmounted upstream interface modules: the BVH and tracking-pause buttons, `BigButton`, the reset tutorial page, the overlay widget and assignment artwork. Restore from tag `checkpoint/pre-restructure` if a route needs them.

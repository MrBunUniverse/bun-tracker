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
| Quest streaming, Wi-Fi ADB, scrcpy install | `questCapture` | The Remote page says Quest streaming is unavailable and disables those controls. |
| Quest audio | `questAudio` | Not available. |
| Mac built-in dictation | `transcribeNativeSpeech`, `requestMicrophoneAccess` | Dictation says Mac speech is unavailable and points to Groq. |
| Tray actions | `onTrayReset`, `onTrayElevationStep`, `onTrayElevationReset` | No tray yet. `tauri` is built without `tray-icon`. |
| Discord presence | `setPresence` | No-op in the shim. |
| Server status stream | `onServerStatus` | No-op. The launcher runs the server separately. |
| Window decorations, tray translations | `showDecorations`, `setTranslations` | No-op. |
| Steam detection | `isSteam` | Always false. |

Known gaps that are not contract members:

- The udev rules file `gui/tauri/resources/69-slimevr-devices.rules` is not placed in the app's install directory, which is where `UdevRulesModal` reads it.
- `flake.nix` still describes the Electron build (`pkgs.electron`, electron-builder, `ELECTRON_*`). It has not been validated against the Tauri app, so treat the Nix shell as unverified.

### Quest restoration plan

This is separate behavior work and needs a real headset to accept. Restore it in this order, one capability per change:

1. Bring back the process-owning pieces from commit `7ce72074` as Tauri commands in their own module under `gui/tauri/src/`: ADB detection and connection, then scrcpy, then audio.
2. Add a shim entry only once a command works, so `questNative` stays false until the feature is real.
3. Add the matching capabilities, and validate all input at the IPC boundary. Never start `adb` or `scrcpy` from a path the frontend supplies.
4. Stop only the processes the app started, matched by exact path. Never stop ADB or scrcpy globally.
5. Accept each step on a real Quest: connect, stream, audio, stop, and quit cleanup.

Speech and tray follow the same steps.

## Removed from upstream

- The Electron host and packaging. Restore from commit `7ce72074`.
- Unmounted upstream interface modules: the BVH and tracking-pause buttons, `BigButton`, the reset tutorial page, the overlay widget and assignment artwork. Restore from tag `checkpoint/pre-restructure` if a route needs them.

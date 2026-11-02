# Architecture Reference

## Components

| Component | Path | Responsibility |
| --- | --- | --- |
| React interface | `gui/app/src/` | UI, state, WebSocket hooks, tracking workflows |
| Tauri shell | `gui/tauri/` | Native window, IPC commands, capabilities |
| Server core | `server/core/` | Sensor ingestion, fusion, skeleton, RPC, OSC |
| Desktop server | `server/desktop/` | Desktop bootstrap and shadow JAR |
| SolarXR protocol | `solarxr-protocol/` | FlatBuffers schemas and generated TypeScript/Java libraries |
| OpenVR bridge | `bindings-provider/` | SteamVR/OpenVR integration |

`solarxr-protocol/` and `bindings-provider/openvr/` are Git submodules. Keep revision changes explicit.

## Ports

| Port | Transport | Owner |
| --- | --- | --- |
| `6969` | UDP | SlimeVR tracker packets |
| `21110` | TCP/WebSocket | GUI to SlimeVR server RPC/data feed |
| `9000` | UDP | VRChat/Quest OSC output |
| `5173` | TCP | Vite development server (started by `Start SlimeVR.command`) |

Confirm ownership with `lsof -nP` before changing or terminating a listener, for example `lsof -nP -iTCP:21110 -sTCP:LISTEN`.

## Launch Path

`Start SlimeVR.command` (repo root) starts the server jar `server/desktop/build/libs/slimevr.jar`, the dongle bridge `tools/esp32-dongle/bridge.py` when a dongle is attached, and the Spike through the workspace Tauri CLI (`gui/tauri/node_modules/.bin/tauri dev`) with Vite on port 5173. It stops the processes it started on Ctrl+C or when its window closes.

## Frontend Build

The Spike frontend is a plain Vite app. `gui/app/vite.config.ts` writes `gui/app/dist/`, which `gui/tauri/tauri.conf.json` uses as `frontendDist`. `beforeBuildCommand` runs that build; `beforeDevCommand` runs `pnpm start` (Vite on 5173, strict port) for a bare `tauri dev`; the launcher sets it to null and owns Vite itself. The Electron build and its packaging are retired; the retired source remains recoverable from git history.

Retained compatibility assets:

- `window.electronAPI` is still the frontend contract name. The Tauri shell injects `gui/tauri/shim/electron-shim.js` to provide it, and its types live in `gui/shared/electron-api.ts` (import `@shared/electron-api`).
- `gui/tauri/resources/69-slimevr-devices.rules` is the udev rules file. `UdevRulesModal` reads `69-slimevr-devices.rules` from the app's install directory, which the Tauri bundle does not yet place there.
- `solarxr-protocol/` is the only protocol source. The frontend links it as the workspace package `solarxr-protocol: workspace:*`; Gradle uses `solarxr-protocol/protocol/java`.

## Native Boundaries

- Tauri commands (the `generate_handler!` list): `gui/tauri/src/main.rs`
- Capabilities granted to the frontend: `gui/tauri/capabilities/`
- Window lifecycle and quit handling: `gui/tauri/src/main.rs`
- Frontend calls to these commands: `gui/app/src/`

Keep frontend access behind the Tauri command list and capabilities; do not widen capabilities or add unrestricted shell or filesystem access.

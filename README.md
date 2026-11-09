# Bun Tracker

A SlimeVR-compatible tracking server and desktop app, forked from the [SlimeVR server](https://github.com/SlimeVR/SlimeVR-Server) for full-body tracking. It has a redesigned desktop app, some tracker reliability changes, and tools for using a Meta Quest with VRChat.

**This is an early work in progress.** Things are unfinished and change often. It is only tested on macOS. It is not an official SlimeVR release and is not affiliated with the SlimeVR team.

## What's in the repo

| Folder | What it is |
| :--- | :--- |
| `server/` | The tracking server, written in Kotlin. It takes tracker data over UDP and sends out poses and OSC. |
| `gui/` | The desktop app (Bun Tracker): the React and TypeScript interface in `gui/app/`, the Tauri shell in `gui/tauri/`, and the native API contract in `gui/shared/`. |
| `solarxr-protocol/` | The message format between the server and the app. A submodule, from [SJ-SolarXR-Protocol](https://github.com/MrBunUniverse/SJ-SolarXR-Protocol). |
| `bindings-provider/` | OpenVR bindings. |
| `docs/` | Notes and guides. Start at [`docs/README.md`](docs/README.md). |

## What's different from upstream

- A new desktop interface.
- Tracker reconnect handling and drift compensation.
- Meta Quest and VRChat OSC tools.
- More tests.

Still missing: Windows and Linux testing, installers, and more polish. See the [changelog](CHANGELOG.md) for details.

## Setup

You need JDK 17 (the Gradle toolchain targets 17), Node.js 22 (see `.node-version`), [pnpm](https://pnpm.io), and a Rust toolchain for the Tauri shell.

```bash
git clone --recurse-submodules https://github.com/MrBunUniverse/SJ-SlimeVR-Server-Custom.git
cd SJ-SlimeVR-Server-Custom
pnpm install --frozen-lockfile
```

On macOS, build the server jar first, then start everything from the repo root:

```bash
./gradlew :server:desktop:shadowJar
pnpm start                            # same as: bash "Start SlimeVR.command" (or double-click the file in Finder)
```

The launcher starts the server, the USB dongle bridge if an ESP32 is plugged in, and Bun Tracker with hot reload, the default way to run the app. Bun Tracker loads its frontend from Vite on port 5173, so saved edits under `gui/app/src/` are picked up without a rebuild. To stop, press Ctrl+C in its Terminal window or close the window. It stops only what that window started; anything already running is left alone. The launcher finds a Python interpreter with pyserial for the optional dongle bridge; set `SLIMEVR_PYTHON` to choose one explicitly.

The WebSocket API on port 21110 listens on loopback by default. To allow native clients on a trusted LAN, set `websocketApiAllowRemote: true` under the existing `server:` section of `vrconfig.yml`, then restart the server. Remote access has no authentication: any client that can reach this port can send RPC commands and change settings. Browser connections also require a local Origin; this setting does not enable a browser UI hosted at a LAN address.

## Development

Run these from the repo root:

```bash
pnpm start                            # hot-reload launcher: server, dongle bridge, and Bun Tracker (Vite on 5173)
pnpm build                            # build the Bun Tracker app bundle (Tauri; runs the Vite build first)
pnpm lint                             # GUI type check, ESLint, and Prettier on src/
pnpm test                             # GUI test suites (Node 22)
pnpm verify                           # all quick checks; add --full for server, protocol, and the app
./gradlew :server:desktop:shadowJar   # build the server jar the launcher runs
./gradlew :server:core:test           # run server tests
```

The default Tauri build produces the native `.app` on macOS; it does not create a DMG installer.

`pnpm --dir gui/app build` builds only the Vite frontend into `gui/app/dist/`, which is what the Tauri shell packages.

See the [contributing guide](docs/CONTRIBUTING.md) for more.

## Credits and license

Based on the work of the [SlimeVR](https://slimevr.dev) project and its contributors. SlimeVR is a trademark of its owners; see [docs/TRADEMARK.md](docs/TRADEMARK.md).

This fork's changes to the upstream files are listed in [docs/fork/CUSTOM.md](docs/fork/CUSTOM.md) and in the git history.

The root [LICENSE](LICENSE) is Apache 2.0. Server code is MIT, and new contributions are licensed under both, as upstream does. Details are in [`docs/licenses/`](docs/licenses) and [`server/LICENSE.md`](server/LICENSE.md).

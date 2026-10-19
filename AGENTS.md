# SlimeVR Server (SJ fork)

Kotlin tracking server, Tauri/React GUI (the SlimeVR Spike), Quest integration, and the SolarXR protocol.

## Priorities

1. Follow the current request and preserve its scope.
2. Preserve existing work. The worktree is often intentionally dirty (`firmware_backups/`, `gui/.context-shears/`, `docs/audits/*.patch`); never reset, stash, clean, or rewrite unrelated changes.
3. Fix the root cause with the smallest maintainable change.
4. Verify in proportion to the files changed and report results as actually run. Never assume or hard-code a test count.

## Current UI: edit only this copy

- The live UI is the Tauri SlimeVR Spike. Frontend: `tauri-spike/latest/gui/src/` (styles in `src/index.scss`). Tauri shell: `tauri-spike/src-tauri/`. It runs from the main checkout on `main`; `Start SlimeVR.command` starts it with Vite on port 5173 and hot reload.
- Edit only that copy. Do not edit the removed Electron `gui/` (kept only in `.backup/electron-version-20261019.zip`), any archived copy, or a copy in another worktree.
- From a session worktree, edits reach the running app only after they are committed on the session branch and fast-forwarded into `main` (`git -C <main checkout> merge --ff-only <branch>`). Check `git status` in a worktree before removing it.

## Repository map

| Area | Location | Notes |
| --- | --- | --- |
| Tauri shell | `tauri-spike/src-tauri/` | Native window, tray, capabilities |
| React interface | `tauri-spike/latest/gui/src/` | Components, hooks, state, styling |
| GUI tests | `tauri-spike/latest/gui/tests/` | Node-based automated suites |
| Tracking server | `server/core/` | Kotlin tracking, OSC, RPC, configuration |
| Desktop server | `server/desktop/` | Desktop entry point and packaged JAR |
| Protocol | `solarxr-protocol/` | Git submodule; FlatBuffers and generated libraries |
| OpenVR bindings | `bindings-provider/` | Includes the `openvr` submodule |
| Launcher | `Start SlimeVR.command` (repo root) | Starts the server, dongle bridge, and Spike |
| Documentation | `docs/` | Start at `docs/README.md` |

Generated or local-state dirs are not source: `.backup/`, `.gradle/`, `.kotlin/`, `.pnpm-store/`, `.tools/`, `build/`, `graphify-out/`, `tauri-spike/latest/gui/out/`, `node_modules/`. `.Codex/settings.json` denies reads there. Search with `rg` on explicit source paths (`tauri-spike/latest/gui/src`, `server/core`, `server/desktop`).

## Commands

Run from the repo root unless noted.

| Task | Command |
| --- | --- |
| GUI lint | `cd tauri-spike/latest/gui && pnpm run lint` |
| GUI tests | `cd tauri-spike/latest/gui && pnpm test` |
| GUI build | `cd tauri-spike/latest/gui && pnpm run build` |
| GUI dev and launch | `bash "Start SlimeVR.command"` (server, dongle bridge, and Spike; Vite on 5173) |
| Server tests + jar | `./gradlew :server:core:test :server:desktop:shadowJar` |
| Protocol build | `cd solarxr-protocol && pnpm run build` |
| Theme token check | `python3 tauri-spike/tools/check-theme-tokens.py bun` |

## Verification

Run the checks for every area touched. If a command cannot run, report the exact reason.

| Changed area | Required verification |
| --- | --- |
| Documentation or Codex config only | `git diff --check`; confirm referenced paths and commands exist |
| `tauri-spike/latest/gui/src/`, GUI config | `cd tauri-spike/latest/gui && pnpm run lint && pnpm test`; theme changes also run the theme token check |
| GUI build or packaging | GUI checks, then `cd tauri-spike/latest/gui && pnpm run build` |
| Kotlin/Java under `server/` | Relevant Gradle tests, then `./gradlew :server:desktop:shadowJar` |
| `solarxr-protocol/` | `cd solarxr-protocol && pnpm run build`, remove only `tauri-spike/latest/gui/node_modules/.vite`, then GUI checks |
| Shell launcher | `bash -n "Start SlimeVR.command"`, plus a project-scoped process/port check if lifecycle behavior changed |

## Skills and rules

- `slimevr-dev` skill: invoke for implementation, diagnosis, build, launch, protocol, or server work. Read only the reference it links for the task.
- `apple-design` skill: only for UI/UX review or design work.
- `.Codex/rules/` loads automatically: `implementation-discipline.md` and `graphify.md` always; `ui-map.md` when working under `tauri-spike/latest/gui/src/`.

## Safety

- Project-scoped process cleanup only. Never `pkill`/`killall` Java, Electron, ADB, or scrcpy globally; match this project's exact executable or JAR paths.
- Submodules (`solarxr-protocol/`, `bindings-provider/openvr/`), lockfiles, and generated assets: do not modify unless the task requires it. Never edit generated output when a source file or build command exists.
- Validate external input at IPC, network, file, and process boundaries.
- Preserve user data and configuration; prefer recoverable operations over recursive deletion or unverified migrations.
- Finish with a concise summary: changed files, behavior, verification actually run, remaining limitations.

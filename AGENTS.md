# SlimeVR Server (SJ fork)

Kotlin tracking server, Tauri/React GUI (the SlimeVR Spike), Quest integration, and the SolarXR protocol.

## Priorities

1. Follow the current request and preserve its scope.
2. Preserve existing work. The worktree is often intentionally dirty (`firmware_backups/`, `.context-shears/`, `docs/audits/*.patch`); never reset, stash, clean, or rewrite unrelated changes.
3. Fix the root cause with the smallest maintainable change.
4. Verify in proportion to the files changed and report results as actually run. Never assume or hard-code a test count.

## Current UI: edit only this copy

- The live UI is the Tauri SlimeVR Spike. Frontend: `gui/app/src/` (styles in `src/index.scss`). Tauri shell: `gui/tauri/`. It runs from the main checkout on `main`; `Start SlimeVR.command` starts it with Vite on port 5173 and hot reload.
- Edit only that copy. Do not edit the retired Electron GUI (recoverable from git history), the old `tauri-spike/` layout (recoverable from the `checkpoint/pre-restructure` tag), any archived copy, or a copy in another worktree.
- From a session worktree, edits reach the running app only after they are committed on the session branch and fast-forwarded into `main` (`git -C <main checkout> merge --ff-only <branch>`). Check `git status` in a worktree before removing it.

## Repository map

| Area | Location | Notes |
| --- | --- | --- |
| Tauri shell | `gui/tauri/` | Native window, tray, capabilities; the crate root and `tauri.conf.json` live here |
| React interface | `gui/app/src/` | Components, hooks, state, styling |
| Native API contract | `gui/shared/electron-api.ts` | Types for `window.electronAPI`; import as `@shared/electron-api` |
| GUI tests | `gui/app/tests/` | Node-based automated suites |
| Tracking server | `server/core/` | Kotlin tracking, OSC, RPC, configuration |
| Desktop server | `server/desktop/` | Desktop entry point and packaged JAR |
| Protocol | `solarxr-protocol/` | Git submodule; FlatBuffers and generated libraries |
| OpenVR bindings | `bindings-provider/` | Includes the `openvr` submodule |
| Launcher | `Start SlimeVR.command` (repo root) | Starts the server, dongle bridge, and Spike |
| GUI tools | `tools/gui/` | Theme token check, resource measurement, icon source |
| Fork notes | `docs/fork/` | `CUSTOM.md` feature inventory, `UPSTREAM.md` merge and rollback workflow |
| Documentation | `docs/` | Start at `docs/README.md` |

Generated or local-state dirs are not source: `.backup/`, `.gradle/`, `.kotlin/`, `.pnpm-store/`, `.tools/`, `build/`, `graphify-out/`, `gui/app/dist/`, `gui/tauri/target/`, `gui/tauri/gen/`, `node_modules/`. Skip them. This is a convention; nothing tracked in this repo enforces it. Search with `rg` on explicit source paths (`gui/app/src`, `server/core`, `server/desktop`).

## Commands

Run from the repo root unless noted.

| Task | Command |
| --- | --- |
| All current checks | `pnpm verify` (add `--full` for server tests, jar, and the Tauri app) |
| Install dependencies | `pnpm install --frozen-lockfile` (one workspace and lockfile at the repo root) |
| GUI lint | `cd gui/app && pnpm run lint` |
| GUI tests | `cd gui/app && pnpm test` |
| GUI build | `cd gui/app && pnpm run build` |
| GUI dev and launch | `bash "Start SlimeVR.command"` (server, dongle bridge, and Spike; Vite on 5173) |
| Server tests + jar | `./gradlew :server:core:test :server:desktop:shadowJar` |
| Protocol build | `cd solarxr-protocol && pnpm run build` |
| Theme token check | `python3 tools/gui/check-theme-tokens.py bun` |

## Verification

Run the checks for every area touched. If a command cannot run, report the exact reason.

| Changed area | Required verification |
| --- | --- |
| Documentation or agent instructions only | `git diff --check`; confirm referenced paths and commands exist |
| `gui/app/src/`, GUI config | `cd gui/app && pnpm run lint && pnpm test`; theme changes also run the theme token check |
| GUI build or packaging | GUI checks, then `cd gui/app && pnpm run build` |
| `gui/tauri/` | GUI checks, then `cd gui/tauri && cargo check && cargo test`; packaging changes also run `pnpm build` from the repo root |
| Kotlin/Java under `server/` | Relevant Gradle tests, then `./gradlew :server:desktop:shadowJar` |
| `solarxr-protocol/` | `cd solarxr-protocol && pnpm run build`, remove only `gui/app/node_modules/.vite`, then GUI checks |
| Shell launcher | `bash -n "Start SlimeVR.command"` and `bash tools/launcher-tests/test-start-slimevr.sh`, plus a project-scoped process/port check if lifecycle behavior changed |

## Skills and rules

Shared instructions live in `.agents/`. Read them directly; do not assume a tool has loaded them.

- `.agents/skills/slimevr-dev/SKILL.md`: for implementation, diagnosis, build, launch, protocol, or server work. Read only the reference it links for the task.
- `.agents/skills/apple-design/SKILL.md`: only for UI/UX review or design work.
- `.agents/rules/implementation-discipline.md`: before editing. `.agents/rules/ui-map.md`: before working under `gui/app/src/`. `.agents/rules/graphify.md`: before using Graphify.

## Safety

- Project-scoped process cleanup only. Never `pkill`/`killall` Java, Electron, ADB, or scrcpy globally; match this project's exact executable or JAR paths.
- Submodules (`solarxr-protocol/`, `bindings-provider/openvr/`), lockfiles, and generated assets: do not modify unless the task requires it. Never edit generated output when a source file or build command exists.
- Validate external input at IPC, network, file, and process boundaries.
- Preserve user data and configuration; prefer recoverable operations over recursive deletion or unverified migrations.
- Finish with a concise summary: changed files, behavior, verification actually run, remaining limitations.

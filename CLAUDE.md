# SlimeVR Server (SJ fork)

Kotlin tracking server, Electron/React GUI, Quest integration, and the SolarXR protocol.

## Priorities

1. Follow the current request and preserve its scope.
2. Preserve existing work. The worktree is often intentionally dirty (`firmware_backups/`, `gui/.context-shears/`, `docs/audits/*.patch`); never reset, stash, clean, or rewrite unrelated changes.
3. Fix the root cause with the smallest maintainable change.
4. Verify in proportion to the files changed and report results as actually run. Never assume or hard-code a test count.

## Repository map

| Area | Location | Notes |
| --- | --- | --- |
| Electron main/preload | `gui/electron/` | Native integration, lifecycle, IPC, Quest audio |
| React interface | `gui/src/` | Components, hooks, state, styling |
| GUI tests | `gui/tests/` | Node-based automated suites |
| Tracking server | `server/core/` | Kotlin tracking, OSC, RPC, configuration |
| Desktop server | `server/desktop/` | Desktop entry point and packaged JAR |
| Protocol | `solarxr-protocol/` | Git submodule; FlatBuffers and generated libraries |
| OpenVR bindings | `bindings-provider/` | Includes the `openvr` submodule |
| Launch helpers | `scripts/` | `Launch SlimeVR.command`, `Stop SlimeVR.command` |
| Documentation | `docs/` | Start at `docs/README.md` |

Generated or local-state dirs are not source: `.backup/`, `.gradle/`, `.kotlin/`, `.pnpm-store/`, `.tools/`, `build/`, `graphify-out/`, `gui/out/`, `node_modules/`. `.claude/settings.json` denies reads there. Search with `rg` on explicit source paths (`gui/src`, `gui/electron`, `server/core`, `server/desktop`).

## Commands

Run from the repo root unless noted.

| Task | Command |
| --- | --- |
| GUI lint | `cd gui && pnpm run lint` |
| GUI tests | `cd gui && pnpm test --run` |
| GUI build | `cd gui && pnpm run build` |
| GUI dev | `cd gui && pnpm run gui` |
| Server tests + jar | `./gradlew :server:core:test :server:desktop:shadowJar` |
| Protocol build | `cd solarxr-protocol && pnpm run build` |
| Launch / stop | `bash "scripts/Launch SlimeVR.command"` / `bash "scripts/Stop SlimeVR.command"` |

## Verification

Run the checks for every area touched. If a command cannot run, report the exact reason.

| Changed area | Required verification |
| --- | --- |
| Documentation or Claude config only | `git diff --check`; confirm referenced paths and commands exist |
| `gui/src/`, `gui/electron/`, GUI config | `cd gui && pnpm run lint && pnpm test --run` |
| Electron/Vite build or packaging | GUI checks, then `cd gui && pnpm run build` |
| Kotlin/Java under `server/` | Relevant Gradle tests, then `./gradlew :server:desktop:shadowJar` |
| `solarxr-protocol/` | `cd solarxr-protocol && pnpm run build`, remove only `gui/node_modules/.vite`, then GUI checks |
| Shell launcher | `bash -n <exact-script>`, plus a project-scoped process/port check if lifecycle behavior changed |

## Skills and rules

- `slimevr-dev` skill: invoke for implementation, diagnosis, build, launch, protocol, or server work. Read only the reference it links for the task.
- `apple-design` skill: only for UI/UX review or design work.
- `.claude/rules/` loads automatically: `implementation-discipline.md` and `graphify.md` always; `ui-map.md` when working under `gui/src/`.

## Safety

- Project-scoped process cleanup only. Never `pkill`/`killall` Java, Electron, ADB, or scrcpy globally; match this project's exact executable or JAR paths.
- Submodules (`solarxr-protocol/`, `bindings-provider/openvr/`), lockfiles, and generated assets: do not modify unless the task requires it. Never edit generated output when a source file or build command exists.
- Validate external input at IPC, network, file, and process boundaries.
- Preserve user data and configuration; prefer recoverable operations over recursive deletion or unverified migrations.
- Finish with a concise summary: changed files, behavior, verification actually run, remaining limitations.

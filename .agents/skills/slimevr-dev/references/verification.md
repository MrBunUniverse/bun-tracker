# Verification Reference

Run checks from the repository root unless a command explicitly changes directory.

## Everything

```bash
pnpm verify          # whitespace, launcher, GUI, theme tokens, Tauri crate
pnpm verify --full   # also protocol, server tests and jar, Tauri app, Android assets
```

`tools/verify.sh` stops at the first failure. Use the narrower commands below while iterating.

## GUI Logic

Run from the repository root:

```bash
cd gui/app && pnpm run lint && pnpm test
```

`pnpm test` runs `tests/e2e-runner.ts` through Node's built-in runner. It takes no `--run` flag.

For theme changes, also run the theme token check from the repository root:

```bash
python3 tools/gui/check-theme-tokens.py bun
```

For build or packaging changes, also run:

```bash
(cd gui/app && pnpm run build) # Vite frontend into gui/app/dist (the Tauri frontendDist)
pnpm build                     # Tauri app bundle; runs the Vite build first
```

For Tauri shell changes under `gui/tauri/`, also run `cd gui/tauri && cargo check && cargo test`.

Do not encode a fixed test total in instructions; require zero failures and use the current runner output.

Suites live in `gui/app/tests/` and run on Node's built-in runner through `tests/e2e-runner.ts`. They are source-contract and simulation tests; they do not replace browser, Tauri-window, or connected-headset checks. `tier1`-`tier4` cover features, boundaries, combinations, and scenarios; `adaptive-bpm`, `quest-capture`, and `runtime-efficiency` are support suites; shared simulators are in `tests/helpers/test-utils.ts`. Run one file while iterating:

```bash
cd gui/app && node --test --experimental-strip-types tests/tier1-features.test.ts
```

Many tier tests assert on source text (class names, token values). When a UI change intentionally alters one, update the matching assertion in the same change.

## Server

Run tests relevant to the modified server package, then rebuild the runtime artifact:

```bash
./gradlew :server:core:test :server:desktop:shadowJar
```

Confirm `server/desktop/build/libs/slimevr.jar` was produced.

## Protocol

From the repository root:

```bash
(cd solarxr-protocol && pnpm run build)
rm -rf gui/app/node_modules/.vite
(cd gui/app && pnpm run lint && pnpm test)
```

Target exactly `gui/app/node_modules/.vite`; never delete the complete dependency tree.

## Launcher and Documentation

```bash
bash -n "Start SlimeVR.command"
bash tools/launcher-tests/test-start-slimevr.sh
git diff --check
```

The launcher suite uses fake tools and test ports only.

If launcher lifecycle behavior changed, check only this project's listeners, for example `lsof -nP -iTCP:21110 -sTCP:LISTEN` (server) and `lsof -nP -iTCP:5173 -sTCP:LISTEN` (Vite). Do not stop processes by name.

For documentation-only changes, validate every referenced file and command. Application rebuilds are unnecessary unless documentation work also changes executable configuration.

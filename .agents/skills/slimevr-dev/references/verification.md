# Verification Reference

Run checks from the repository root unless a command explicitly changes directory.

## GUI Logic

```bash
cd gui && pnpm run lint && pnpm test --run
```

For Electron/Vite build or packaging changes, also run:

```bash
cd gui && pnpm run build
```

Do not encode a fixed test total in instructions; require zero failures and use the current runner output.

Suites live in `gui/tests/` and run on Node's built-in runner through `tests/e2e-runner.ts`. They are source-contract and simulation tests; they do not replace browser, packaged-Electron, or connected-headset checks. `tier1`-`tier4` cover features, boundaries, combinations, and scenarios; `adaptive-bpm`, `quest-capture`, and `runtime-efficiency` are support suites; shared simulators are in `tests/helpers/test-utils.ts`. Run one file while iterating:

```bash
cd gui && node --test --experimental-strip-types tests/tier1-features.test.ts
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
rm -rf gui/node_modules/.vite
(cd gui && pnpm run lint && pnpm test --run)
```

Target exactly `gui/node_modules/.vite`; never delete the complete dependency tree.

## Launch Scripts and Documentation

```bash
bash -n "scripts/Launch SlimeVR.command"
bash -n "scripts/Stop SlimeVR.command"
git diff --check
```

For documentation-only changes, validate every referenced file and command. Application rebuilds are unnecessary unless documentation work also changes executable configuration.

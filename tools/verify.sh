#!/bin/bash
# Runs the project's checks from any directory and stops at the first failure.
#   pnpm verify          whitespace, doc links, launcher, GUI, theme tokens, Tauri crate
#   pnpm verify --full   also protocol rebuild, server tests and jar, Android assets, Tauri app
set -euo pipefail
cd "$(dirname "$0")/.."

full=false
case "${1:-}" in
	"") ;;
	--full) full=true ;;
	*) echo "Usage: pnpm verify [--full]"; exit 2 ;;
esac
step() { printf '\n==> %s\n' "$*"; }

step "Whitespace"
git diff --check HEAD

step "Docs"
python3 tools/check-docs.py
python3 tools/test-check-docs.py

step "Launcher"
bash -n "Start SlimeVR.command"
bash tools/launcher-tests/test-start-slimevr.sh

if $full; then
	step "Protocol"
	(cd solarxr-protocol && pnpm run build)
	rm -rf gui/app/node_modules/.vite
fi

step "GUI lint and tests"
(cd gui/app && pnpm run lint && pnpm test)

step "Theme tokens"
python3 tools/gui/check-theme-tokens.py bun

step "Tauri crate"
(cd gui/tauri && cargo check && cargo test)

if $full; then
	step "Server tests and jar"
	./gradlew :server:core:test :server:desktop:shadowJar

	step "Tauri app (includes the Vite build)"
	pnpm build

	step "Android assets"
	./gradlew :server:android:copyGuiAssets
fi

step "All checks passed"

# Changelog

This project is in early development. Versions below 1.0 can change anything without notice.

Version numbers follow `0.MINOR.PATCH`. A minor version adds features or changes behavior. A patch version only fixes things.

## Unreleased

Desktop app moved to Tauri, and the repository was reorganized.

- The desktop app now runs in a Tauri shell. The Electron host is retired.
- The app now lives in `gui/app`, `gui/shared` and `gui/tauri`, with one pnpm workspace at the repo root.
- `solarxr-protocol/` is now the only protocol source.
- Added the ESP32 USB dongle and its bridge.
- Added fork docs and a single `pnpm verify` command.

Known limits: some native features are disabled in the Tauri shell, including Quest streaming and audio, Mac built-in dictation, and the tray. The app reports each one as unavailable. See `docs/fork/CUSTOM.md`.

## 0.3.0 (2026-10-04)

Tracker reliability and new tests.

- Added drift compensation, so trackers stay aligned over longer sessions.
- Added a pose stability estimate for each tracker.
- Added recovery states, so a tracker that drops out can rejoin more smoothly.
- Added a UDP connection registry.
- Updated the desktop interface and Quest diagnostics.
- Added server and app tests.
- Moved developer docs into `docs/dev/` and the launch scripts into `scripts/`.
- The protocol submodule now points to `SJ-SolarXR-Protocol`.

Known limits: only tested on macOS, and there are no installers.

## 0.2.0 (2026-09-17)

Redesigned desktop interface.

- New navy, gray and amber theme.
- New top bar, tabs and floating navigation.
- Reworked tracker cards, diagnostics, setup, settings and broadcast controls.
- Routes, tracker behavior and saved settings are unchanged.

## 0.1.1 (2026-09-17)

- Added the Apache 2.0 license file.

## 0.1.0 (2026-09-17)

- Snapshot of the project before the interface redesign.

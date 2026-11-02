# Runtime and Diagnostics Reference

## Launch and Stop

```bash
bash "Start SlimeVR.command"   # also opens from Finder by double-click
```

The launcher starts, in order: the server (built with `./gradlew :server:desktop:shadowJar` when the jar is missing or older than the Kotlin sources), the USB dongle bridge if an ESP32 is plugged in, and the Spike: Vite on port 5173 with Tauri pointed at it for hot reload. Ctrl+C or closing the window stops only what that window started. Anything already listening on 21110 or 5173, or already running from this checkout, is left alone and never duplicated. Lifecycle changes must keep that ownership rule: match this checkout's absolute paths, never broad process names.

Overrides, mainly for tests: `SLIMEVR_PYTHON` (interpreter that must have pyserial; the Dongle popup's Start button honors it too), `SLIMEVR_DONGLE_PORT` (empty means no dongle), `SERVER_PORT`, `SPIKE_PORT`. Launcher tests: `bash tools/launcher-tests/test-start-slimevr.sh`; they use fake tools and test ports only.

## Logs and Ports

```bash
tail -f ~/Library/Logs/SlimeVR-launcher/server.log   # also spike.log, vite.log, bridge.log
lsof -nP -iTCP:21110 -sTCP:LISTEN
lsof -nP -iUDP:6969
```

Prefer logs and listener ownership over guessing. A busy port can be another valid instance or an orphan; identify the PID and command before acting.

## Quest Capture

The current Tauri shell does not implement the native Quest ADB, scrcpy, audio, or capture bridge. The interface disables unavailable native controls and keeps demo mode available. The retired Electron process lifecycle does not apply to this build.

External Quest tools may still use ADB port 5037 and wireless ADB port 5555. Check their exact process and device ownership before changing them; do not stop ADB or scrcpy globally. A valid Wi-Fi address does not prove the headset is reachable.

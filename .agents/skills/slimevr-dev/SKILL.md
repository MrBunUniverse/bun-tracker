---
name: slimevr-dev
description: Build, test, launch, diagnose, or modify this SlimeVR Kotlin server, Tauri/React GUI, Quest integration, or SolarXR protocol. Use for repository implementation work; skip for unrelated prose tasks.
---

# SlimeVR Development

The root `AGENTS.md` holds the repository map, commands, and verification matrix. Preserve the dirty worktree, keep changes scoped, and select verification from the changed-area matrix there.

Load only the reference needed for the task:

- Read [`references/architecture.md`](references/architecture.md) for subsystem ownership, ports, IPC, or cross-component changes.
- Read [`references/runtime.md`](references/runtime.md) for launching, logs, process lifecycle, Quest ADB, scrcpy, or audio routing.
- Read [`references/verification.md`](references/verification.md) when changing build, test, package, server, or protocol behavior.

For visual UI work, use `docs/dev/UI_MAP.md` as the first locator but verify the current symbol before editing. For process cleanup, match this project and exact executable/JAR paths; never terminate unrelated Java, Electron, ADB, or scrcpy processes.

# Bun Tracker

Bun Tracker is my personal version of [SlimeVR Server](https://github.com/SlimeVR/SlimeVR-Server), the open-source software that turns body trackers into full-body tracking for VR. I adapted it for my own setup and share it with friends and a few people I trust.

**This is an early work in progress.** Things are unfinished and change often. It is only tested on macOS. It is an unofficial project: it is not a SlimeVR release and is not affiliated with the SlimeVR team.

## What's different from SlimeVR

### The desktop app

- A redesigned interface, with a top navigation bar and a navy, gray and amber look.
- Tracker cards in place of plain rows, which adapt to the window width.
- Three themes: Bun, Fox and Dog.
- A microphone picker for the voice features.
- A built-in User Agreement page under Settings.

### Tracking

- Drift compensation keeps trackers aligned over long sessions, with settings you can adjust. It can be switched on for all trackers at once.
- Resets know about your posture, including a yaw reset for when you are lying down.
- A tracker that drops out can rejoin more smoothly instead of snapping back.
- An automatic full reset option.
- A foot-slide clamp that reduces feet sliding across the floor.
- A stability estimate for each tracker, and smoother handling of uneven network timing.

### Hardware

- Support for an ESP32 USB dongle as a tracker receiver.
- Over-the-air tracker updates through the dongle, including a Wi-Fi flash mode, so trackers can be updated without opening them up.

### VRChat and Meta Quest

- VRChat chatbox tools: show what Apple Music is playing, a BPM readout, and voice dictation into the chatbox.
- A remote page that controls the separate Quest StreamCast app.

### Privacy

- No error reporting or usage data is sent to SlimeVR, and there is no update check against upstream.

## Not done yet

- Windows and Linux are untested.
- There are no installers.
- Some native features are switched off for now: the system tray, Mac built-in dictation, and Discord presence. The app tells you when one is unavailable.

Developer notes are in [`docs/`](docs/README.md). The full list of changes is in the [changelog](CHANGELOG.md).

## User Agreement

This is the same text as in the app under Settings > User Agreement.

**About Bun Tracker.** Bun Tracker is my personal version of SlimeVR Server, adapted for my own setup and shared with friends and a few people I trust. It's an unofficial project. SlimeVR and its developers didn't make it, don't support it, and aren't connected to it in any way.

**Credit where it's due.** SlimeVR Server is the work of the SlimeVR team and its many contributors, and nearly everything here is built on what they made. I don't claim their work as my own. All credit for the original project belongs to them, and its Apache 2.0 license and copyright notices still apply.

**If something goes wrong.** Please don't take problems with Bun Tracker to the SlimeVR developers, their Discord, or their GitHub. Many of the changes in this version are mine, so an issue you run into may not exist in SlimeVR at all. Message me on Discord instead.

**AI-assisted ("vibe coding").** Much of Bun Tracker's own code and docs (the changes on top of SlimeVR) was written with help from AI coding assistants, a way of working often called "vibe coding". I direct the work, test it on my own setup and review what goes in, but I'm not a professional software developer, and the code hasn't been through a professional or SlimeVR review. So it may contain bugs, odd behavior or mistakes that a careful human review would have caught, and you should treat it as experimental. Please don't rely on it where a tracking error could hurt you or others, and play in a safe, clear space. The original SlimeVR code it builds on was written by the SlimeVR team, not by AI. AI involvement applies only to my changes, and SlimeVR's license and copyright notices still apply.

**No guarantees.** I look after Bun Tracker in my spare time and share it as-is, without any warranty. I'll do my best to help when something breaks, but please use it at your own risk.

**In short.** By using Bun Tracker, you agree to the points above, including that parts of it are AI-assisted and provided as-is, and to treat the original SlimeVR developers with the respect their work deserves. Thank you for using it.

## Contact

Discord: `jamevm` (SirJame). [Open my profile](https://discord.com/users/390812634481688576), or search "jamevm" in Discord's Add Friend.

## License

Based on the work of the [SlimeVR](https://slimevr.dev) project and its contributors ([SlimeVR-Server](https://github.com/SlimeVR/SlimeVR-Server)). SlimeVR is a trademark of its owners; see [docs/TRADEMARK.md](docs/TRADEMARK.md).

The root [LICENSE](LICENSE) is Apache 2.0. Server code is MIT, and new contributions are licensed under both, as upstream does. Details are in [`docs/licenses/`](docs/licenses) and [`server/LICENSE.md`](server/LICENSE.md).

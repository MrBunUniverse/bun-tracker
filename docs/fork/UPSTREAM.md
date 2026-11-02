# Tracking upstream

This fork keeps upstream's shape: Kotlin server in `server/`, protocol in `solarxr-protocol/`, desktop app in `gui/`. Custom work is an overlay on those paths, listed in [CUSTOM.md](CUSTOM.md).

## Remotes

| Remote | Use |
| --- | --- |
| `origin` | `MrBunUniverse/SJ-SlimeVR-Server` |
| `custom-private` | `MrBunUniverse/SJ-SlimeVR-Server-Custom` |
| `upstream` | `SlimeVR/SlimeVR-Server`, fetch only. Its push URL is `DISABLED`, and tags are not fetched so they cannot clash with fork tags. |

`git rerere` is on for this clone, so repeated conflicts reuse their earlier resolutions.

## Pins

Recorded 2026-11-02. Recheck before relying on these.

| Item | Value |
| --- | --- |
| Server fork point | `554976390` (2026-08-20), the merge base with `upstream/main` |
| `upstream/main` when recorded | `83941fd38` (2026-09-18), 10 commits past the fork point |
| Upstream releases | The fork contains `v21.0.0`. It does not contain `v21.1.0`, the newest stable tag, which is in those 10 commits. |
| Upstream v22 | Only `v22.0.0-rc.1` and `rc.2`. `rc.2` is not on `upstream/main`. No stable v22 yet. |
| Protocol | `9f8a473` on `sj-custom`, two commits on top of `00c38a6`, which is also upstream's pin |
| OpenVR | `v2.12.14` (`918253051`) |

Unknown:

- Which upstream commit the Spike frontend was snapshotted from. It entered this repo in `c02c29b9e` (2026-10-16) as new files, so git cannot trace `gui/app/` to upstream `gui/`.
- Whether upstream's Electron changes since the fork point matter to the Tauri shell. Nothing has compared them.

## Merging upstream

Fetch without recursing into submodules:

```bash
git fetch --no-recurse-submodules upstream
git log --oneline "$(git merge-base HEAD upstream/main)..upstream/main"
```

1. Start clean on a new branch, and read the incoming commits first.
2. Back up the config as described under Rollback.
3. Merge a stable tag or a chosen commit, never an RC: `git merge --no-ff <commit>`.
4. Upstream's `gui/` paths do not exist here, so they arrive as conflicts. Keep this fork's layout with `git rm -r` on the incoming `gui/src` and `gui/electron` paths, and port what you need:

   ```bash
   git diff <fork-point> <commit> -- gui/src | git apply --3way -p2 --directory=gui/app
   ```

5. Keep every feature in `CUSTOM.md`. Keep custom config fields, because dropping one erases it from `vrconfig.yml`.
6. Protocol: merge the upstream protocol into `sj-custom`, keep the custom schemas, then update the submodule pin here. Never replace `sj-custom` with the official pin.
7. Run `pnpm verify --full`, and test with real trackers before merging into `main`.

## Rollback and config

The server's config is at `~/Library/Application Support/dev.slimevr.SlimeVR/vrconfig.yml`. The launcher copies it to `~/Library/Logs/SlimeVR-launcher/vrconfig.backup.yml` before each server start, but that copy is overwritten every time. Before running any other build, make your own dated copy. A jar that does not know a custom field rewrites the config without it.

The Spike's settings are in `~/Library/Application Support/dev.slimevr.tauri-spike/` (`settings.json`, `cache.json`). They depend on the bundle identifier, so keep it unchanged.

To roll back code, check out the earlier commit, rebuild with `./gradlew :server:desktop:shadowJar`, restore your dated config copy, and start the launcher. Tag `checkpoint/pre-restructure` is the last commit with the `tauri-spike/` layout.

## Before adopting upstream's rewrite

Do not port to upstream's v22 rewrite until all of these hold:

- Upstream has a stable v22 tag, not an RC.
- Each server feature in `CUSTOM.md` has a port or a recorded decision to drop it.
- The custom protocol schemas are merged or re-expressed on v22's protocol pin.
- A migration for `vrconfig.yml` keeps the custom fields, tested on a copy of the real config.
- The server cutover has a rollback tested with the dated config backup.
- A session with the real trackers and the VRChat flow matches the current build.

Do not bulk-port. Move one feature at a time, each with its own test.

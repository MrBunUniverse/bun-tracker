# Tracking upstream

This fork keeps upstream's top-level shape: Kotlin server in `server/`, protocol in `solarxr-protocol/`, desktop app in `gui/`. Under `gui/` it differs: `gui/app`, `gui/shared` and `gui/tauri`, with no Electron host. Custom work is listed in [CUSTOM.md](CUSTOM.md).

## Remotes

| Remote | Use |
| --- | --- |
| `origin` | `MrBunUniverse/SJ-SlimeVR-Server` |
| `custom-private` | `MrBunUniverse/SJ-SlimeVR-Server-Custom` |
| `upstream` | `SlimeVR/SlimeVR-Server`, fetch only. Its push URL is `DISABLED`, and tags are not fetched so they cannot clash with fork tags. Both repos have a `v0.1.0`, at different commits. |

`git rerere` is on for this clone, so repeated conflicts reuse their earlier resolutions.

## Pins

Recorded 2026-11-02. Recheck before relying on these.

| Item | Value |
| --- | --- |
| Server fork point | `554976390` (2026-08-20), the merge base with `upstream/main` |
| `upstream/main` when recorded | `83941fd38` (2026-09-18), 10 commits past the fork point |
| Upstream releases | The fork contains `v21.0.0`. It does not contain `v21.1.0` (`c11dc54ed`), the newest stable tag, which is in those 10 commits. |
| Upstream v22 | Only `v22.0.0-rc.1` and `rc.2` (`b0b381b6f`). `rc.2` is not on `upstream/main`. No stable v22 yet. |
| Protocol | `9f8a473` on `sj-custom`, two commits on top of `00c38a6`, which is also upstream's pin |
| OpenVR | `v2.12.14` (`918253051`) |

Unknown:

- Which upstream commit the Spike frontend was snapshotted from. It entered this repo in `c02c29b9e` (2026-10-16) as new files, so git cannot trace `gui/app/` to upstream `gui/`.
- Whether upstream's Electron changes since the fork point matter to the Tauri shell. Nothing has compared them.

## Upstream's GUI layouts

Upstream's GUI paths depend on the commit. Check with `git ls-tree --name-only <commit> gui/`.

| Upstream commit | GUI paths | Here |
| --- | --- | --- |
| `upstream/main` and `v21.x`, as recorded above | Flat: `gui/src`, `gui/public`, `gui/electron` | `gui/src` maps to `gui/app/src`, and `gui/public` to `gui/app/public`. `gui/electron` has no counterpart. |
| `v22.0.0-rc.*`, the rewrite | `gui/app`, `gui/shared`, `gui/electron` | `gui/app` and `gui/shared` use the same names here, but their history is unrelated. `gui/electron` still has no counterpart. |

## Merging upstream

Fetch without recursing into submodules:

```bash
git fetch --no-recurse-submodules upstream
git log --oneline "$(git merge-base HEAD upstream/main)..upstream/main"
```

That fetch brings no tags. To use a tag, fetch that one into its own namespace, and use `refs/upstream-tags/v21.1.0` as `<commit>` below. Do not run `git fetch --tags upstream`, which can collide with fork tags.

```bash
git fetch --no-tags --no-recurse-submodules upstream refs/tags/v21.1.0:refs/upstream-tags/v21.1.0
```

Preview the merge before starting it:

```bash
git merge-tree --write-tree --name-only --messages HEAD <commit>
git diff --name-status --diff-filter=A "$(git merge-base HEAD <commit>)" <commit>
```

`merge-tree` writes git objects, but it does not touch the working tree, the index, or any branch. Exit status 1 means it found conflicts, which is expected here. Above 1 is a real error. The second command lists what upstream added, because additions usually merge with no conflict and so never appear as one. For `upstream/main` on 2026-11-02, the conflicts were `.gitignore`, `TrackersUDPServer.kt`, and the deleted workflows `pontoon-pr.yml` and `rebase.yml`. The conflict-free additions were `crowdin.yml` and `.github/workflows/crowdin-test.yml`.

1. Start clean on a new branch, and read the incoming commits first.
2. Back up the config as described under Rollback.
3. Merge a stable tag or a chosen commit, never an RC, and stop before committing: `git merge --no-ff --no-commit <commit>`.
4. Review every incoming path one at a time, both conflicts and files that merged cleanly: `git diff --cached --name-status HEAD`. This fork removed upstream's workflows and Electron host, and a merge can bring them back without a conflict. A workflow runs on GitHub once it is pushed, so read its triggers and permissions. Remove a path you do not want with `git rm -f -- <path>`. Do not remove whole folders of incoming source without reading them.
5. Port the GUI changes you need, using the layout table. For a flat commit, map the paths while applying:

   ```bash
   git diff "$(git merge-base HEAD <commit>)" <commit> -- gui/src gui/public | git apply --3way -p2 --directory=gui/app
   ```

   For a rewrite commit, the paths already match, but the content has no shared history. Review each file by hand instead of taking either side whole. Port `gui/electron` behavior to `gui/tauri` by hand, only when it is needed.

6. Keep every feature in `CUSTOM.md`. Keep custom config fields, because dropping one erases it from `vrconfig.yml`.
7. Protocol: merge the upstream protocol into `sj-custom`, keep the custom schemas, then update the submodule pin here. Never replace `sj-custom` with the official pin.
8. Run `pnpm verify --full`, and test with real trackers before merging into `main`.

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

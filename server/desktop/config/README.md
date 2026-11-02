# Portable configuration folder

The server checks for a folder named `config/` in its **working directory**. The folder's contents do not matter, and this file only keeps the folder in git.

- **`config/` exists:** the server uses `vrconfig.yml` in the working directory, next to `config/`, not inside it.
- **`config/` does not exist:** the server uses `vrconfig.yml` in the user config directory (`~/Library/Application Support/dev.slimevr.SlimeVR/` on macOS). If that file is missing and the working directory has a `vrconfig.yml`, the server moves it there.

So portable mode applies only when the server starts from `server/desktop/`, which is what `./gradlew run` does. It suits an isolated test instance. `Start SlimeVR.command` and the Spike's restart button start the server from the repo root, which has no `config/`, so they use the user config directory.

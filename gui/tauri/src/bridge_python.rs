use std::env;
use std::ffi::{OsStr, OsString};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

const FIXED_PYTHONS: [&str; 2] = ["/opt/homebrew/bin/python3", "/usr/local/bin/python3"];
const FRAMEWORK_VERSIONS: &str = "/Library/Frameworks/Python.framework/Versions";
// A broken interpreter or the macOS command line tools prompt must not hang the Start button.
const PROBE_TIMEOUT: Duration = Duration::from_secs(5);

/// First interpreter that can import pyserial. Same search as find_python in Start SlimeVR.command.
pub fn find() -> Result<PathBuf, String> {
    let pin = env::var_os("SLIMEVR_PYTHON").filter(|pin| !pin.is_empty());
    let path = env::var_os("PATH");
    pick(pin, || candidates(path.as_deref(), Path::new(FRAMEWORK_VERSIONS)), has_pyserial)
}

fn pick(
    pin: Option<OsString>,
    candidates: impl FnOnce() -> Vec<PathBuf>,
    usable: impl Fn(&Path) -> bool,
) -> Result<PathBuf, String> {
    if let Some(pin) = pin {
        let pin = PathBuf::from(pin);
        return if usable(&pin) {
            Ok(pin)
        } else {
            Err(format!(
                "SLIMEVR_PYTHON ({}) can't run or can't import pyserial. Fix it or unset it.",
                pin.display()
            ))
        };
    }
    candidates()
        .into_iter()
        .find(|python| usable(python))
        .ok_or_else(|| "No Python with pyserial found. Run: python3 -m pip install pyserial".to_string())
}

fn candidates(path: Option<&OsStr>, framework_versions: &Path) -> Vec<PathBuf> {
    // Like `command -v`, only the first python3 on PATH counts. A relative entry would depend on
    // the app's working directory, so those are skipped.
    let on_path = path.into_iter().flat_map(env::split_paths).find_map(|dir| {
        let python = dir.join("python3");
        (dir.is_absolute() && is_executable(&python)).then_some(python)
    });
    let mut versions: Vec<PathBuf> = fs::read_dir(framework_versions)
        .into_iter()
        .flatten()
        .filter_map(|version| Some(version.ok()?.path().join("bin/python3")))
        .collect();
    versions.sort();
    on_path
        .into_iter()
        .chain(FIXED_PYTHONS.iter().map(PathBuf::from))
        .chain(versions)
        .collect()
}

fn is_executable(path: &Path) -> bool {
    fs::metadata(path).is_ok_and(|file| file.is_file() && file.permissions().mode() & 0o111 != 0)
}

fn has_pyserial(python: &Path) -> bool {
    let Ok(mut child) = Command::new(python)
        .args(["-c", "import serial"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    else {
        return false;
    };
    crate::wait_bounded(&mut child, PROBE_TIMEOUT).is_some_and(|status| status.success())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::time::Instant;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = env::temp_dir().join(format!("slimevr python {name} {}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn script(path: &Path, body: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, format!("#!/bin/sh\n{body}\n")).unwrap();
        fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
    }

    #[test]
    fn a_pin_is_exact_and_never_falls_through() {
        let list = || vec![PathBuf::from("/fallback/python3")];
        let pin = Some(OsString::from("/pinned/python3"));
        assert_eq!(pick(pin.clone(), list, |_| true).unwrap(), PathBuf::from("/pinned/python3"));
        let tried = RefCell::new(Vec::new());
        let error = pick(pin, list, |python| {
            tried.borrow_mut().push(python.to_path_buf());
            false
        })
        .unwrap_err();
        assert!(error.contains("SLIMEVR_PYTHON (/pinned/python3)"), "{error}");
        assert_eq!(*tried.borrow(), [PathBuf::from("/pinned/python3")]);
    }

    #[test]
    fn takes_the_first_usable_candidate_in_order() {
        let list = || ["/a/python3", "/b/python3", "/c/python3"].map(PathBuf::from).to_vec();
        let tried = RefCell::new(Vec::new());
        let found = pick(None, list, |python| {
            tried.borrow_mut().push(python.to_path_buf());
            python == Path::new("/b/python3")
        });
        assert_eq!(found.unwrap(), PathBuf::from("/b/python3"));
        assert_eq!(*tried.borrow(), [PathBuf::from("/a/python3"), PathBuf::from("/b/python3")]);
    }

    #[test]
    fn explains_how_to_fix_a_missing_pyserial() {
        let error = pick(None, || vec![PathBuf::from("/a/python3")], |_| false).unwrap_err();
        assert!(error.contains("pip install pyserial"), "{error}");
    }

    #[test]
    fn searches_path_then_fixed_folders_then_framework_versions() {
        let base = temp_dir("candidates");
        let skipped = base.join("no python here");
        let first = base.join("first/python3");
        let second = base.join("second/python3");
        let not_executable = base.join("text/python3");
        script(&first, "");
        script(&second, "");
        fs::create_dir_all(not_executable.parent().unwrap()).unwrap();
        fs::write(&not_executable, "").unwrap();
        for version in ["3.9", "3.14"] {
            fs::create_dir_all(base.join("versions").join(version)).unwrap();
        }
        let path = env::join_paths([
            Path::new("relative"),
            &skipped,
            not_executable.parent().unwrap(),
            first.parent().unwrap(),
            second.parent().unwrap(),
        ])
        .unwrap();

        let expected = vec![
            first,
            PathBuf::from("/opt/homebrew/bin/python3"),
            PathBuf::from("/usr/local/bin/python3"),
            base.join("versions/3.14/bin/python3"),
            base.join("versions/3.9/bin/python3"),
        ];
        assert_eq!(candidates(Some(&path), &base.join("versions")), expected);
        assert_eq!(candidates(None, &base.join("absent")).len(), 2);
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn probes_a_real_interpreter_by_its_exit_status() {
        let base = temp_dir("probe");
        let good = base.join("good");
        let bad = base.join("bad");
        script(&good, r#"[ "$1 $2" = "-c import serial" ]"#);
        script(&bad, "exit 1");
        assert!(has_pyserial(&good));
        assert!(!has_pyserial(&bad));
        assert!(!has_pyserial(&base.join("missing")));
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn bounded_wait_stops_a_hung_process() {
        let mut child = Command::new("sleep").arg("30").spawn().unwrap();
        let started = Instant::now();
        assert!(crate::wait_bounded(&mut child, Duration::from_millis(150)).is_none());
        assert!(started.elapsed() < Duration::from_secs(5));
        // Killed and reaped: a second wait returns at once instead of waiting 30 s.
        assert!(child.try_wait().unwrap().is_some());
    }
}

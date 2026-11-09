// Remote page bridge to Quest StreamCast, the native app that owns capture. Everything here only asks that app to do
// things over its per-user control socket; nothing is captured or started in this process, so closing Bun Tracker
// leaves the app and its stream running. Commands are a closed list, and no value reaches a shell.

use serde::Deserialize;
use serde_json::{json, Value};
use std::fs;
use std::io::{ErrorKind, Read, Write};
use std::os::unix::fs::{FileTypeExt, MetadataExt};
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::{read_store, store_path, wait_bounded, write_store, StoreLock};

const PROTOCOL: u64 = 1;
const BUNDLE_ID: &str = "local.queststreamcast.app";
const SAVED_PATH_KEY: &str = "streamcastAppPath";
const IO_TIMEOUT: Duration = Duration::from_millis(3000);
const MAX_REPLY_BYTES: u64 = 256 * 1024;
const MAX_VALUE_CHARS: usize = 256;

#[derive(Deserialize, Debug, PartialEq)]
#[serde(tag = "command", rename_all = "camelCase")]
pub enum StreamCastCommand {
    Refresh,
    ReconnectWifi,
    Start,
    Stop,
    Select { serial: String },
    SetGameOutput { uid: Option<String> },
    SetMicOutput { uid: Option<String> },
}

fn clean(value: &str) -> bool {
    !value.is_empty() && value.chars().count() <= MAX_VALUE_CHARS && !value.chars().any(char::is_control)
}

impl StreamCastCommand {
    fn request(&self) -> Result<Value, String> {
        let invalid = |what: &str| Err(format!("Invalid {what}."));
        let mut request = match self {
            Self::Refresh => json!({ "command": "refresh" }),
            Self::ReconnectWifi => json!({ "command": "reconnectWifi" }),
            Self::Start => json!({ "command": "start" }),
            Self::Stop => json!({ "command": "stop" }),
            Self::Select { serial } if !clean(serial) => return invalid("headset"),
            Self::Select { serial } => json!({ "command": "select", "serial": serial }),
            Self::SetGameOutput { uid: Some(uid) } | Self::SetMicOutput { uid: Some(uid) } if !clean(uid) => {
                return invalid("output device")
            }
            Self::SetGameOutput { uid } => json!({ "command": "setGameOutput", "uid": uid }),
            Self::SetMicOutput { uid } => json!({ "command": "setMicOutput", "uid": uid }),
        };
        request["protocol"] = json!(PROTOCOL);
        Ok(request)
    }
}

#[derive(Debug, PartialEq)]
enum Failure {
    // No socket, or a socket nobody is listening on.
    Absent,
    // Someone is there but did not answer in time, or answered with something unusable.
    Unresponsive(String),
    // Not this user's socket.
    Untrusted,
}

// One bounded exchange: the deadline covers the whole reply, so a trickling peer can't hold the worker.
fn exchange(socket: &Path, owner: u32, request: &Value) -> Result<Value, Failure> {
    let meta = fs::symlink_metadata(socket).map_err(|_| Failure::Absent)?;
    if !meta.file_type().is_socket() || meta.uid() != owner {
        return Err(Failure::Untrusted);
    }
    let mut stream = UnixStream::connect(socket).map_err(|e| match e.kind() {
        ErrorKind::ConnectionRefused | ErrorKind::NotFound => Failure::Absent,
        _ => Failure::Unresponsive(e.to_string()),
    })?;
    let broken = |e: std::io::Error| Failure::Unresponsive(e.to_string());
    let deadline = Instant::now() + IO_TIMEOUT;
    stream.set_write_timeout(Some(IO_TIMEOUT)).map_err(broken)?;
    stream.write_all(format!("{request}\n").as_bytes()).map_err(broken)?;

    let mut reply = Vec::new();
    let mut limited = stream.try_clone().map_err(broken)?.take(MAX_REPLY_BYTES + 1);
    let mut chunk = [0u8; 8192];
    while !reply.contains(&b'\n') {
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            return Err(Failure::Unresponsive("timed out".into()));
        }
        limited.get_ref().set_read_timeout(Some(left)).map_err(broken)?;
        match limited.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => reply.extend_from_slice(&chunk[..n]),
            Err(e) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {
                return Err(Failure::Unresponsive("timed out".into()))
            }
            Err(e) => return Err(broken(e)),
        }
    }
    if reply.len() as u64 > MAX_REPLY_BYTES {
        return Err(Failure::Unresponsive("reply too large".into()));
    }
    let line = reply.split(|b| *b == b'\n').next().unwrap_or_default();
    serde_json::from_slice(line).map_err(|_| Failure::Unresponsive("unreadable reply".into()))
}

// Turns a reply into what the page works from. `link` never says the stream stopped: only `connected` carries status.
fn reply_to_link(reply: Value) -> Value {
    match reply["protocol"].as_u64() {
        Some(PROTOCOL) => {}
        other => return json!({ "link": "incompatible", "companionProtocol": other }),
    }
    if reply["code"] == "protocolMismatch" {
        return json!({ "link": "incompatible", "companionProtocol": PROTOCOL });
    }
    if !reply["status"].is_object() {
        return json!({
            "link": "unresponsive",
            "detail": reply["error"].as_str().unwrap_or("Quest StreamCast sent no status."),
        });
    }
    json!({
        "link": "connected",
        "appVersion": reply["appVersion"],
        "status": reply["status"],
        "refused": if reply["ok"] == true { Value::Null } else { reply["error"].clone() },
    })
}

fn failure_to_link(failure: Failure, app_running: Option<bool>) -> Value {
    match failure {
        Failure::Untrusted => json!({ "link": "unresponsive", "detail": "The control socket isn't owned by this user." }),
        // Running without a socket is a build from before this bridge.
        Failure::Absent if app_running == Some(true) => json!({ "link": "noBridge" }),
        Failure::Absent if app_running == Some(false) => json!({ "link": "notRunning" }),
        Failure::Absent => json!({ "link": "unresponsive", "detail": "Couldn't tell whether Quest StreamCast is running." }),
        // A dead process can leave a socket that times out, but only a running app is reported as unresponsive.
        Failure::Unresponsive(_) if app_running == Some(false) => json!({ "link": "notRunning" }),
        Failure::Unresponsive(detail) => json!({ "link": "unresponsive", "detail": detail }),
    }
}

fn run_bounded(program: &str, args: &[&str]) -> Option<(bool, String)> {
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let status = wait_bounded(&mut child, Duration::from_secs(5))?;
    let mut out = String::new();
    child.stdout.take()?.read_to_string(&mut out).ok()?;
    Some((status.success(), out))
}

// lsappinfo prints the app's ASN when it is running and nothing otherwise. None = couldn't tell.
fn app_running() -> Option<bool> {
    let query = format!("bundleid={BUNDLE_ID}");
    let (ok, out) = run_bounded("/usr/bin/lsappinfo", &["find", &query])?;
    ok.then(|| !out.trim().is_empty())
}

fn socket_path(home: &Path) -> PathBuf {
    home.join("Library/Application Support/QuestStreamCast/control/control.sock")
}

// The home folder's owner is this user, without a libc dependency for getuid.
fn talk(home: &Path, request: &Value) -> Value {
    let owner = match fs::metadata(home) {
        Ok(meta) => meta.uid(),
        Err(e) => return json!({ "link": "unresponsive", "detail": e.to_string() }),
    };
    match exchange(&socket_path(home), owner, request) {
        Ok(reply) => reply_to_link(reply),
        Err(failure) => failure_to_link(failure, app_running()),
    }
}

#[tauri::command]
pub async fn streamcast_status(app: AppHandle) -> Result<Value, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || talk(&home, &json!({ "protocol": PROTOCOL, "command": "status" })))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn streamcast_command(app: AppHandle, command: StreamCastCommand) -> Result<Value, String> {
    let request = command.request()?;
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || talk(&home, &request))
        .await
        .map_err(|e| e.to_string())
}

fn bundle_id_of(path: &Path) -> Option<String> {
    let plist = path.join("Contents/Info.plist");
    let (ok, out) = run_bounded(
        "/usr/bin/plutil",
        &["-extract", "CFBundleIdentifier", "raw", "-o", "-", plist.to_str()?],
    )?;
    ok.then(|| out.trim().to_string())
}

// The only app this will ever open. The saved path is user-editable storage, so it is checked at every use.
fn is_streamcast(path: &Path) -> bool {
    path.is_absolute()
        && path.extension().is_some_and(|e| e == "app")
        && bundle_id_of(path).as_deref() == Some(BUNDLE_ID)
}

// `open` activates a running copy and launches otherwise. It never starts a second one (no -n).
// A bundle id goes to whichever copy is running, so the saved path is only for launching.
fn open_args(saved: Option<&Path>, running: bool) -> Vec<String> {
    match saved {
        Some(path) if !running => vec![path.to_string_lossy().into_owned()],
        _ => vec!["-b".into(), BUNDLE_ID.into()],
    }
}

fn open_app(saved: Option<PathBuf>) -> Value {
    let saved = saved.filter(|path| is_streamcast(path));
    let running = app_running().unwrap_or(false);
    let args = open_args(saved.as_deref(), running);
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    match run_bounded("/usr/bin/open", &args) {
        Some((true, _)) => json!({ "result": "opened" }),
        Some((false, _)) => json!({ "result": "missing" }),
        None => json!({ "result": "failed" }),
    }
}

fn saved_path(app: &AppHandle) -> Option<PathBuf> {
    let path = store_path(app, "settings").ok()?;
    saved_path_from_store(&path)
}

fn saved_path_from_store(path: &Path) -> Option<PathBuf> {
    read_store(path).get(SAVED_PATH_KEY)?.as_str().map(PathBuf::from)
}

/// Launches Quest StreamCast, or brings the running copy forward. Starting a stream is a separate, explicit command.
#[tauri::command]
pub async fn streamcast_open(app: AppHandle) -> Result<Value, String> {
    let saved = saved_path(&app);
    tauri::async_runtime::spawn_blocking(move || open_app(saved))
        .await
        .map_err(|e| e.to_string())
}

/// Lets the user point at the app when macOS can't find it, remembers the choice, and opens it.
#[tauri::command]
pub async fn streamcast_locate(app: AppHandle, lock: State<'_, StoreLock>) -> Result<Value, String> {
    let handle = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        handle
            .dialog()
            .file()
            .set_title("Locate Quest StreamCast")
            .set_directory("/Applications")
            .add_filter("Applications", &["app"])
            .blocking_pick_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(path) = picked.and_then(|p| p.into_path().ok()) else {
        return Ok(json!({ "result": "canceled" }));
    };
    let check = path.clone();
    let valid = tauri::async_runtime::spawn_blocking(move || is_streamcast(&check))
        .await
        .map_err(|e| e.to_string())?;
    if !valid {
        return Ok(json!({ "result": "wrongApp" }));
    }
    {
        let _guard = lock.0.lock().map_err(|e| e.to_string())?;
        let store = store_path(&app, "settings")?;
        let mut map = read_store(&store);
        map.insert(SAVED_PATH_KEY.into(), json!(path.to_string_lossy()));
        write_store(&store, &map)?;
    }
    tauri::async_runtime::spawn_blocking(move || open_app(Some(path)))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::net::UnixListener;
    use std::thread;

    fn folder(name: &str) -> PathBuf {
        let dir = PathBuf::from(format!("/tmp/sc-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn owner(dir: &Path) -> u32 {
        fs::metadata(dir).unwrap().uid()
    }

    // A fake companion that reads one line and answers with `reply`, returning what it read.
    fn companion(name: &str, reply: &'static [u8]) -> (PathBuf, thread::JoinHandle<String>) {
        let dir = folder(name);
        let path = dir.join("c.sock");
        let listener = UnixListener::bind(&path).unwrap();
        let worker = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut seen = Vec::new();
            let mut byte = [0u8; 1];
            while stream.read(&mut byte).unwrap() == 1 && byte[0] != b'\n' {
                seen.push(byte[0]);
            }
            let _ = stream.write_all(reply);
            String::from_utf8(seen).unwrap()
        });
        (path, worker)
    }

    #[test]
    fn commands_are_a_closed_list() {
        let parse = |v: Value| serde_json::from_value::<StreamCastCommand>(v);
        assert_eq!(parse(json!({ "command": "start" })).unwrap(), StreamCastCommand::Start);
        assert!(parse(json!({ "command": "shell", "serial": "x" })).is_err());
        // Extra fields are dropped: the request is rebuilt from the typed command, never forwarded.
        assert_eq!(
            parse(json!({ "command": "start", "extra": 1 })).unwrap().request().unwrap(),
            json!({ "protocol": 1, "command": "start" })
        );
        assert!(parse(json!({ "command": "select" })).is_err());
    }

    #[test]
    fn requests_carry_the_protocol_and_refuse_junk_values() {
        let select = StreamCastCommand::Select { serial: "1.2.3.4:5555".into() }.request().unwrap();
        assert_eq!(select, json!({ "protocol": 1, "command": "select", "serial": "1.2.3.4:5555" }));
        let default_output = StreamCastCommand::SetMicOutput { uid: None }.request().unwrap();
        assert_eq!(default_output, json!({ "protocol": 1, "command": "setMicOutput", "uid": null }));
        assert!(StreamCastCommand::Select { serial: "a\nb".into() }.request().is_err());
        assert!(StreamCastCommand::Select { serial: String::new() }.request().is_err());
        assert!(StreamCastCommand::SetGameOutput { uid: Some("x".repeat(300)) }.request().is_err());
    }

    #[test]
    fn a_good_exchange_returns_the_status() {
        let (path, worker) = companion(
            "good",
            b"{\"ok\":true,\"protocol\":1,\"appVersion\":\"0.3.0\",\"status\":{\"ready\":true}}\n",
        );
        let reply = exchange(&path, owner(path.parent().unwrap()), &json!({ "protocol": 1, "command": "status" })).unwrap();
        assert_eq!(worker.join().unwrap(), r#"{"command":"status","protocol":1}"#);
        let link = reply_to_link(reply);
        assert_eq!(link["link"], "connected");
        assert_eq!(link["status"]["ready"], true);
        assert_eq!(link["refused"], Value::Null);
    }

    #[test]
    fn a_refused_command_keeps_the_status() {
        let link = reply_to_link(json!({
            "ok": false, "protocol": 1, "error": "Stop the session to switch headsets.", "status": { "ready": true },
        }));
        assert_eq!(link["link"], "connected");
        assert_eq!(link["refused"], "Stop the session to switch headsets.");
    }

    #[test]
    fn other_protocols_ask_for_an_update() {
        let older = reply_to_link(json!({ "ok": true, "protocol": 0, "status": {} }));
        assert_eq!(older["link"], "incompatible");
        assert_eq!(older["companionProtocol"], 0);
        let newer = reply_to_link(json!({ "ok": true, "protocol": 7, "status": {} }));
        assert_eq!(newer["companionProtocol"], 7);
        assert_eq!(reply_to_link(json!({ "ok": true }))["link"], "incompatible");
    }

    #[test]
    fn a_missing_socket_is_absent() {
        let dir = folder("absent");
        assert_eq!(exchange(&dir.join("none.sock"), owner(&dir), &json!({})), Err(Failure::Absent));
    }

    #[test]
    fn a_socket_nobody_listens_on_is_absent() {
        let dir = folder("stale");
        let path = dir.join("c.sock");
        drop(UnixListener::bind(&path).unwrap());
        assert_eq!(exchange(&path, owner(&dir), &json!({})), Err(Failure::Absent));
    }

    #[test]
    fn a_plain_file_or_foreign_owner_is_refused() {
        let dir = folder("untrusted");
        let file = dir.join("c.sock");
        fs::write(&file, "x").unwrap();
        assert_eq!(exchange(&file, owner(&dir), &json!({})), Err(Failure::Untrusted));

        let path = dir.join("d.sock");
        let _listener = UnixListener::bind(&path).unwrap();
        assert_eq!(exchange(&path, owner(&dir) + 1, &json!({})), Err(Failure::Untrusted));
    }

    #[test]
    fn a_silent_companion_times_out() {
        let dir = folder("silent");
        let path = dir.join("c.sock");
        let _listener = UnixListener::bind(&path).unwrap(); // accepts in the backlog, never answers
        let started = Instant::now();
        let result = exchange(&path, owner(&dir), &json!({}));
        assert_eq!(result, Err(Failure::Unresponsive("timed out".into())));
        assert!(started.elapsed() < IO_TIMEOUT + Duration::from_secs(1));
    }

    #[test]
    fn junk_and_oversized_replies_are_refused() {
        let (path, worker) = companion("junk", b"not json\n");
        let junk = exchange(&path, owner(path.parent().unwrap()), &json!({}));
        worker.join().unwrap();
        assert_eq!(junk, Err(Failure::Unresponsive("unreadable reply".into())));

        let (path, worker) = companion("huge", Box::leak(vec![b'x'; 300 * 1024].into_boxed_slice()));
        let huge = exchange(&path, owner(path.parent().unwrap()), &json!({}));
        worker.join().unwrap();
        assert_eq!(huge, Err(Failure::Unresponsive("reply too large".into())));
    }

    #[test]
    fn lost_control_is_never_reported_as_a_stopped_stream() {
        let timeout = || Failure::Unresponsive("timed out".into());
        assert_eq!(failure_to_link(timeout(), Some(true))["link"], "unresponsive");
        assert_eq!(failure_to_link(timeout(), None)["link"], "unresponsive");
        assert_eq!(failure_to_link(Failure::Absent, None)["link"], "unresponsive");
        for link in [failure_to_link(timeout(), Some(true)), failure_to_link(Failure::Absent, None)] {
            assert!(link.get("status").is_none());
        }
    }

    #[test]
    fn app_state_explains_an_absent_socket() {
        assert_eq!(failure_to_link(Failure::Absent, Some(true))["link"], "noBridge");
        assert_eq!(failure_to_link(Failure::Absent, Some(false))["link"], "notRunning");
    }

    #[test]
    fn first_launch_does_not_require_a_saved_app_location() {
        let dir = folder("saved-location");
        let store = dir.join("settings.json");
        assert_eq!(saved_path_from_store(&store), None);
        fs::write(&store, r#"{"unrelated":true}"#).unwrap();
        assert_eq!(saved_path_from_store(&store), None);
        fs::write(&store, r#"{"streamcastAppPath":42}"#).unwrap();
        assert_eq!(saved_path_from_store(&store), None);
        fs::write(&store, r#"{"streamcastAppPath":"/Applications/QuestStreamCast.app"}"#).unwrap();
        assert_eq!(saved_path_from_store(&store), Some(PathBuf::from("/Applications/QuestStreamCast.app")));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn open_never_starts_a_second_copy() {
        let saved = Path::new("/Applications/Quest StreamCast.app");
        assert_eq!(open_args(Some(saved), false), vec![saved.to_str().unwrap()]);
        assert_eq!(open_args(Some(saved), true), vec!["-b", BUNDLE_ID]);
        assert_eq!(open_args(None, false), vec!["-b", BUNDLE_ID]);
    }

    #[test]
    fn only_the_streamcast_bundle_is_accepted() {
        let dir = folder("bundle");
        let make = |name: &str, id: &str| {
            let app = dir.join(name);
            fs::create_dir_all(app.join("Contents")).unwrap();
            fs::write(
                app.join("Contents/Info.plist"),
                format!(r#"<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>{id}</string></dict></plist>"#),
            )
            .unwrap();
            app
        };
        assert!(is_streamcast(&make("Good.app", BUNDLE_ID)));
        assert!(!is_streamcast(&make("Other.app", "com.apple.Terminal")));
        assert!(!is_streamcast(&make("NotAnApp", BUNDLE_ID)));
        assert!(!is_streamcast(Path::new("Good.app")));
        assert!(!is_streamcast(&dir.join("Missing.app")));
    }
}

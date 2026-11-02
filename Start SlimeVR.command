#!/bin/bash
# Double-click to start SlimeVR: the server, the USB dongle bridge (if the ESP32 is
# plugged in) and the Spike app with live reload. Close this window or press Ctrl+C
# to stop what this window started. Anything already running is left alone.
# Launcher tests: tools/launcher-tests/test-start-slimevr.sh

ROOT="$(cd "$(dirname "$0")" && pwd)"
GUI="$ROOT/gui/app"
TAURI="$ROOT/gui/tauri"
JAR="$ROOT/server/desktop/build/libs/slimevr.jar"
APP="$TAURI/target/debug/slimevr-tauri-spike"
BRIDGE="$ROOT/tools/esp32-dongle/bridge.py"
SERVER_PORT="${SERVER_PORT:-21110}"
SPIKE_PORT="${SPIKE_PORT:-5173}"
LOGS="$HOME/Library/Logs/SlimeVR-launcher"
mkdir -p "$LOGS"
# Appended, so tools already on the user's PATH win; these cover a Finder-style minimal PATH.
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.cargo/bin"

# Exact-path ownership: a process belongs to this checkout only if its command line
# contains the checkout's absolute path. Literal match, so other checkouts never match.
owned_pids() {
	[ -n "$1" ] || return 0
	ps -axo pid=,command= | NEEDLE="$1" awk 'index($0, ENVIRON["NEEDLE"]) { print $1 }'
}
listening() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
listener_pid() { lsof -nP -t -iTCP:"$1" -sTCP:LISTEN 2>/dev/null | head -1; }
# True if process $1 has working directory $2 or something below it.
runs_in() {
	local cwd
	cwd="$(lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
	case "$cwd" in "$2" | "$2"/*) return 0 ;; esac
	return 1
}
need() { command -v "$1" >/dev/null 2>&1; }
pause() { [ -t 0 ] && read -rp "Press Enter to close..." _; return 0; }
fail() { echo "$@"; pause; exit 1; }

# The server jar is stale when a Kotlin or Java source is newer than it. Gradle build
# files are not checked; run ./gradlew :server:desktop:shadowJar by hand after those change.
jar_stale() {
	[ -n "$(find "$ROOT/server/core/src" "$ROOT/server/desktop/src" -type f \( -name '*.kt' -o -name '*.java' \) -newer "$JAR" 2>/dev/null | head -1)" ]
}

# First interpreter that can import pyserial. SLIMEVR_PYTHON pins one exactly.
find_python() {
	local c p
	if [ -n "${SLIMEVR_PYTHON:-}" ]; then
		"$SLIMEVR_PYTHON" -c 'import serial' >/dev/null 2>&1 && echo "$SLIMEVR_PYTHON"
		return
	fi
	for c in python3 /opt/homebrew/bin/python3 /usr/local/bin/python3 /Library/Frameworks/Python.framework/Versions/*/bin/python3; do
		p="$(command -v "$c" 2>/dev/null)" || continue
		"$p" -c 'import serial' >/dev/null 2>&1 && { echo "$p"; return 0; }
	done
	return 1
}

started=()    # process-group leaders this window started; all get stopped on exit
components=() # the subset whose exit we wait for
problems=0
bridge_pid=""

stop_started() {
	[ ${#started[@]} -gt 0 ] || return 0
	trap - EXIT
	echo
	echo "Stopping SlimeVR..."
	local pid alive _
	for pid in "${started[@]}"; do kill -TERM -- "-$pid" 2>/dev/null; done
	for _ in 1 2 3 4 5 6 7 8 9 10; do
		alive=0
		for pid in "${started[@]}"; do kill -0 -- "-$pid" 2>/dev/null && alive=1; done
		[ $alive -eq 0 ] && break
		sleep 1
	done
	for pid in "${started[@]}"; do kill -KILL -- "-$pid" 2>/dev/null; done
	started=()
}
set -m # each background job gets its own process group, so stopping it stops its children too
trap stop_started EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# Waits up to $3 seconds for port $1 while process $2 is alive.
wait_for_port() {
	local _
	for _ in $(seq "$3"); do
		listening "$1" && return 0
		kill -0 "$2" 2>/dev/null || return 1
		sleep 1
		echo -n "."
	done
	listening "$1"
}

echo "SlimeVR — logs in $LOGS"

# 1. Server, built from this checkout (the only build that matches your config).
if listening "$SERVER_PORT"; then
	echo "Server: already running on port $SERVER_PORT, leaving it as is."
elif [ -n "$(owned_pids "$JAR")" ]; then
	echo "Server: already starting from this checkout, leaving it as is."
else
	java -version >/dev/null 2>&1 || fail "Server: Java 17 or newer not found. Install a JDK (for example: brew install openjdk) and start again."
	if [ ! -f "$JAR" ] || jar_stale; then
		[ -f "$JAR" ] && echo "Server: jar is older than the sources, rebuilding..." || echo "Server: jar missing, building it..."
		[ -x "$ROOT/gradlew" ] || fail "Server: gradlew not found at $ROOT, cannot build the server."
		(cd "$ROOT" && ./gradlew --console=plain :server:desktop:shadowJar) >"$LOGS/server-build.log" 2>&1 \
			|| { echo "Server: build failed. Last lines of $LOGS/server-build.log:"; tail -20 "$LOGS/server-build.log"; fail; }
	fi
	cp "$HOME/Library/Application Support/dev.slimevr.SlimeVR/vrconfig.yml" "$LOGS/vrconfig.backup.yml" 2>/dev/null
	(cd "$ROOT" && exec java -Xmx128M -jar "$JAR" run) >"$LOGS/server.log" 2>&1 &
	server_pid=$!
	started+=("$server_pid")
	components+=("$server_pid")
	echo -n "Server: starting"
	if ! wait_for_port "$SERVER_PORT" "$server_pid" 60; then
		echo " failed. Last lines of the log:"
		tail -20 "$LOGS/server.log"
		fail
	fi
	echo " up."
fi

# 2. USB dongle bridge (optional). SLIMEVR_DONGLE_PORT overrides detection; empty means none.
DONGLE="${SLIMEVR_DONGLE_PORT-$(ls /dev/cu.usbserial* /dev/cu.usbmodem* 2>/dev/null | head -1)}"
PY=""
if [ -n "$(owned_pids "$BRIDGE")" ]; then
	echo "Dongle: bridge already running, leaving it as is."
elif [ -z "$DONGLE" ]; then
	echo "Dongle: not plugged in, skipping. Trackers on normal Wi-Fi can still connect."
elif ! PY="$(find_python)" || [ -z "$PY" ]; then
	echo "Dongle: needs a Python with pyserial (python3 -m pip install pyserial). Skipping."
	problems=$((problems + 1))
else
	"$PY" -u "$BRIDGE" --port "$DONGLE" >"$LOGS/bridge.log" 2>&1 &
	bridge_pid=$!
	started+=("$bridge_pid")
	components+=("$bridge_pid")
	echo "Dongle: bridge started on $DONGLE."
fi

# 3. Spike app with live reload: Vite on $SPIKE_PORT, then the Tauri window pointed at it.
start_spike() {
	local missing="" tool owner vite_pid tauri_config
	for tool in node pnpm cargo; do need "$tool" || missing="$missing $tool"; done
	if [ -n "$missing" ]; then
		echo "Spike: missing tools:$missing. Install Node, pnpm and Rust (rustup) and start again."
		return 1
	fi
	# Storage cleanups have deleted these before; reinstall instead of failing silently.
	if [ ! -x "$TAURI/node_modules/.bin/tauri" ] || [ ! -d "$GUI/node_modules" ]; then
		echo "Spike: installing packages..."
		(cd "$ROOT" && pnpm install --frozen-lockfile) >"$LOGS/spike-install.log" 2>&1 || { echo "Spike: pnpm install failed, see $LOGS/spike-install.log"; return 1; }
	fi
	owner="$(listener_pid "$SPIKE_PORT")"
	if [ -n "$owner" ] && ! runs_in "$owner" "$GUI"; then
		echo "Spike: port $SPIKE_PORT is used by another program (pid $owner). Quit it and start again."
		return 1
	fi
	if [ -z "$owner" ]; then
		(cd "$GUI" && exec pnpm exec vite --port "$SPIKE_PORT" --strictPort) >"$LOGS/vite.log" 2>&1 &
		vite_pid=$!
		started+=("$vite_pid")
		components+=("$vite_pid")
		echo -n "Spike: starting dev server"
		if ! wait_for_port "$SPIKE_PORT" "$vite_pid" 60; then
			echo " failed. Last lines of $LOGS/vite.log:"
			tail -20 "$LOGS/vite.log"
			return 1
		fi
		echo " up."
	fi
	tauri_config="{\"build\":{\"devUrl\":\"http://localhost:$SPIKE_PORT\",\"beforeDevCommand\":null},\"app\":{\"security\":{\"devCsp\":null}}}"
	(cd "$TAURI" && exec ./node_modules/.bin/tauri dev --config "$tauri_config") >"$LOGS/spike.log" 2>&1 &
	started+=("$!")
	components+=("$!")
	echo "Spike: opening (first start after a reboot can take a minute)."
}
if [ -n "$(owned_pids "$APP")" ]; then
	echo "Spike: already open."
elif [ ! -d "$TAURI" ]; then
	echo "Spike: not found at $TAURI, skipping."
	problems=$((problems + 1))
else
	start_spike || problems=$((problems + 1))
fi

if [ ${#started[@]} -eq 0 ]; then
	if [ $problems -gt 0 ]; then
		echo "Nothing started. See the messages above."
		fail
	fi
	echo "Everything was already running."
	pause
	exit 0
fi

echo
echo "Running. Close this window or press Ctrl+C to stop."
# Show the dongle's 10-second tracker summary while running. The subshell gives the
# pipeline its own process group, so stopping it also stops tail.
if [ -n "$bridge_pid" ]; then
	(tail -n0 -F "$LOGS/bridge.log" 2>/dev/null | grep --line-buffered -E "^trackers:") &
	started+=("$!")
fi
rc=0
for pid in "${components[@]}"; do wait "$pid" || rc=$?; done
# Only reached if everything this window started exited on its own.
echo "Everything stopped by itself. Last lines of the logs:"
for f in server bridge vite spike; do [ -f "$LOGS/$f.log" ] && { echo "== $f.log"; tail -5 "$LOGS/$f.log"; }; done
pause
[ $problems -eq 0 ] || rc=1
exit $rc

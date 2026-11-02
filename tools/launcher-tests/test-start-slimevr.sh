#!/bin/bash
# Mock-process tests for "Start SlimeVR.command". Each case copies the launcher into a
# throwaway checkout under a temp dir whose name has a space, with fake java, gradlew,
# pnpm, Tauri CLI, Python and app binaries. Test ports and a test HOME keep it away from
# the real server, Spike, dongle and logs. Run: bash tools/launcher-tests/test-start-slimevr.sh
set -u

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LAUNCHER="$REPO/Start SlimeVR.command"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/slimevr launcher.XXXXXX")"
WORK="$(cd "$WORK" && pwd)" # the launcher reports paths as pwd spells them, not as TMPDIR does
CHECKOUT="$WORK/with space/checkout"
BIN="$WORK/bin"
CALLS="$WORK/calls.log"
APP="$CHECKOUT/gui/tauri/target/debug/slimevr-tauri-spike"
SERVER_PORT=21911
SPIKE_PORT=5911
TEST_PATH="$BIN:/usr/bin:/bin:/usr/sbin:/sbin"
PASS=0
FAILS=0
LAUNCH_PID=""
LISTENER_PID=""
APP_PID=""
EXIT_CODE=""

cleanup() {
	[ -n "$LAUNCH_PID" ] && kill -KILL "$LAUNCH_PID" 2>/dev/null
	[ -n "$LISTENER_PID" ] && kill -KILL "$LISTENER_PID" 2>/dev/null
	[ -n "$APP_PID" ] && kill -KILL "$APP_PID" 2>/dev/null
	# Fake children a failed case left behind: only pids this test recorded.
	[ -f "$CALLS" ] && awk '{ print $2 }' "$CALLS" | while read -r pid; do kill -KILL "$pid" 2>/dev/null; done
	rm -rf "$WORK"
}
trap cleanup EXIT

listening() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
call_pid() { awk -v n="$1" '$1 == n { print $2; exit }' "$CALLS"; }
has_call() { grep -q "^$1 " "$CALLS" 2>/dev/null; }
wait_text() { # file, text, seconds
	local _
	for _ in $(seq "$3"); do grep -qF "$2" "$1" 2>/dev/null && return 0; sleep 1; done
	return 1
}
wait_port() { # port, seconds
	local _
	for _ in $(seq "$2"); do listening "$1" && return 0; sleep 1; done
	return 1
}
gone() { # pid: true once it has exited (a zombie counts as exited)
	local _ state
	for _ in 1 2 3 4 5; do
		state="$(ps -o stat= -p "$1" 2>/dev/null)"
		case "$state" in "" | Z*) return 0 ;; esac
		sleep 1
	done
	return 1
}
# Waits up to $2 seconds for launcher $1 to exit; its status lands in EXIT_CODE.
wait_exit() {
	local _ state
	for _ in $(seq "$2"); do
		state="$(ps -o stat= -p "$1" 2>/dev/null)"
		case "$state" in "" | Z*) wait "$1"; EXIT_CODE=$?; return 0 ;; esac
		sleep 1
	done
	return 1
}
# Collects the launcher's status: wait $1 seconds for a natural exit, then TERM it and
# give it 20 more seconds (a launcher that ignores TERM counts as a failure, 124).
collect_launcher() {
	wait_exit "$LAUNCH_PID" "$1" || {
		kill -TERM "$LAUNCH_PID" 2>/dev/null
		wait_exit "$LAUNCH_PID" 20 || { kill -KILL "$LAUNCH_PID" 2>/dev/null; EXIT_CODE=124; }
	}
	LAUNCH_PID=""
}
check() { # description, command...
	local desc="$1"
	shift
	if "$@"; then
		PASS=$((PASS + 1))
		echo "ok   $desc"
	else
		FAILS=$((FAILS + 1))
		echo "FAIL $desc"
	fi
}

make_fakes() {
	mkdir -p "$BIN"
	cat >"$BIN/java" <<'EOF'
#!/bin/bash
[ "$1" = -version ] && exit 0
echo "java $$ $*" >>"$CALLS"
[ -n "${FAKE_JAVA_EXIT:-}" ] && { echo "fake java: exiting $FAKE_JAVA_EXIT" >&2; exit "$FAKE_JAVA_EXIT"; }
exec /usr/bin/python3 -m http.server "$SERVER_PORT" --bind 127.0.0.1 >/dev/null 2>&1
EOF
	cat >"$BIN/pnpm" <<'EOF'
#!/bin/bash
echo "pnpm $$ $*" >>"$CALLS"
exec /usr/bin/python3 -m http.server "$SPIKE_PORT" --bind 127.0.0.1 >/dev/null 2>&1
EOF
	# Serves as the PATH python3: "import serial" succeeds, a bridge run sleeps.
	cat >"$BIN/python3" <<'EOF'
#!/bin/bash
[ "$1" = -c ] && exit 0
echo "bridge $$ $*" >>"$CALLS"
exec sleep 300
EOF
	printf '#!/bin/bash\nexit 0\n' >"$BIN/node"
	printf '#!/bin/bash\nexit 0\n' >"$BIN/cargo"
	chmod +x "$BIN"/*
}

make_checkout() {
	rm -rf "$WORK/with space" "$WORK/home"
	mkdir -p "$CHECKOUT/server/core/src" "$CHECKOUT/server/desktop/src" \
		"$CHECKOUT/server/desktop/build/libs" "$CHECKOUT/gui/tauri/node_modules/.bin" \
		"$CHECKOUT/gui/app/node_modules" "$CHECKOUT/gui/tauri/target/debug" \
		"$CHECKOUT/tools/esp32-dongle" "$WORK/home"
	cp "$LAUNCHER" "$CHECKOUT/"
	touch "$CHECKOUT/tools/esp32-dongle/bridge.py"
	# The jar is older than this source, so every case exercises the rebuild path.
	: >"$CHECKOUT/server/desktop/build/libs/slimevr.jar"
	: >"$CHECKOUT/server/core/src/Old.kt"
	touch -t 202001010000 "$CHECKOUT/server/desktop/build/libs/slimevr.jar"
	cat >"$CHECKOUT/gradlew" <<'EOF'
#!/bin/bash
echo "gradle $*" >>"$CALLS"
touch "$(dirname "$0")/server/desktop/build/libs/slimevr.jar"
EOF
	cat >"$CHECKOUT/gui/tauri/node_modules/.bin/tauri" <<'EOF'
#!/bin/bash
echo "tauri $$ $*" >>"$CALLS"
exec sleep 300
EOF
	chmod +x "$CHECKOUT/gradlew" "$CHECKOUT/gui/tauri/node_modules/.bin/tauri" "$CHECKOUT/Start SlimeVR.command"
	: >"$CALLS"
}

# Starts the launcher with stdin not a terminal (so it never waits for Enter). Extra
# environment is passed as arguments: launch OUT_FILE [VAR=value ...]
launch() {
	local out="$1"
	shift
	env HOME="$WORK/home" PATH="$TEST_PATH" CALLS="$CALLS" SERVER_PORT="$SERVER_PORT" \
		SPIKE_PORT="$SPIKE_PORT" SLIMEVR_DONGLE_PORT="" "$@" \
		bash "$CHECKOUT/Start SlimeVR.command" >"$out" 2>&1 </dev/null &
	LAUNCH_PID=$!
}

# A stand-in for a server already running outside this checkout.
start_listener() {
	/usr/bin/python3 -m http.server "$SERVER_PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
	LISTENER_PID=$!
	wait_port "$SERVER_PORT" 10
}

# Syntax first; every later case depends on it.
check "bash -n launcher" bash -n "$LAUNCHER"
check "bash -n test script" bash -n "$0"

if listening "$SERVER_PORT" || listening "$SPIKE_PORT"; then
	echo "Test ports $SERVER_PORT/$SPIKE_PORT are in use; stop that listener and rerun."
	exit 2
fi
make_fakes

# Case 1: healthy start from a path with spaces, then stop. Nothing is left running.
make_checkout
out="$WORK/case1.out"
launch "$out"
check "case 1: launcher reports running" wait_text "$out" "Running." 60
# "Running." prints as soon as Tauri is backgrounded, which can be before it logs its call.
check "case 1: Tauri CLI called" wait_text "$CALLS" '"beforeDevCommand":null' 10
server_pid=$(call_pid java)
spike_pid=$(call_pid tauri)
vite_pid=$(call_pid pnpm)
check "case 1: stale jar rebuilt before start" has_call gradle
check "case 1: server started with the space-named jar" grep -qF -- "-jar $CHECKOUT/server/desktop/build/libs/slimevr.jar run" "$CALLS"
check "case 1: Tauri CLI given the dev URL on the test port" grep -qF "http://localhost:$SPIKE_PORT" "$CALLS"
check "case 1: Tauri does not start a second Vite server" grep -qF '"beforeDevCommand":null' "$CALLS"
check "case 1: dongle skipped when none plugged in" grep -qF "Dongle: not plugged in" "$out"
collect_launcher 0
check "case 1: recorded the server, Tauri and Vite pids" [ -n "$server_pid$spike_pid$vite_pid" ]
check "case 1: TERM exits 143" [ "$EXIT_CODE" -eq 143 ]
check "case 1: prints stop message" grep -qF "Stopping SlimeVR..." "$out"
check "case 1: server stopped" gone "$server_pid"
check "case 1: Tauri stopped" gone "$spike_pid"
check "case 1: Vite stopped" gone "$vite_pid"
check "case 1: server port released" bash -c "! lsof -nP -iTCP:$SERVER_PORT -sTCP:LISTEN >/dev/null 2>&1"

# Case 2: server and Spike already running from this checkout: start nothing, duplicate nothing.
make_checkout
start_listener
# exec keeps one pid (so killing it leaves no orphan) and argv[0] keeps the path the launcher matches on.
printf '#!/bin/bash\nexec -a "$0" sleep 300\n' >"$APP"
chmod +x "$APP"
"$APP" >/dev/null 2>&1 &
APP_PID=$!
sleep 1
out="$WORK/case2.out"
launch "$out"
collect_launcher 30
check "case 2: server listener reported as already running" grep -qF "Server: already running on port $SERVER_PORT" "$out"
check "case 2: Spike reported as already open" grep -qF "Spike: already open." "$out"
check "case 2: nothing started" bash -c "[ ! -s '$CALLS' ]"
check "case 2: exits 0 when everything already runs" [ "$EXIT_CODE" -eq 0 ]
kill "$APP_PID" "$LISTENER_PID" 2>/dev/null
APP_PID=""
LISTENER_PID=""

# Case 3: server dies at startup. The launcher stops, names the failure, and exits 1.
make_checkout
out="$WORK/case3.out"
launch "$out" FAKE_JAVA_EXIT=3
collect_launcher 60
check "case 3: server failure exits 1" [ "$EXIT_CODE" -eq 1 ]
check "case 3: failure names the server log" grep -qF "failed. Last lines of the log" "$out"
check "case 3: server error reaches the window" grep -qF "fake java: exiting 3" "$out"
check "case 3: Spike not started after server failure" bash -c "! grep -q '^tauri ' '$CALLS'"

# Case 4: Spike tools missing with nothing else to start: says what is missing, exits 1.
make_checkout
start_listener
rm -f "$BIN/cargo"
out="$WORK/case4.out"
launch "$out"
collect_launcher 60
kill "$LISTENER_PID" 2>/dev/null
LISTENER_PID=""
printf '#!/bin/bash\nexit 0\n' >"$BIN/cargo"
chmod +x "$BIN/cargo"
check "case 4: names the missing tool" grep -qF "Spike: missing tools: cargo" "$out"
check "case 4: nothing started, exits 1" [ "$EXIT_CODE" -eq 1 ]

# Case 5a: dongle needs pyserial. A pinned interpreter without it is reported, not used.
make_checkout
out="$WORK/case5a.out"
printf '#!/bin/bash\n[ "$1" = -c ] && exit 1\n' >"$WORK/nopyserial"
chmod +x "$WORK/nopyserial"
launch "$out" SLIMEVR_DONGLE_PORT=/dev/cu.test-dongle SLIMEVR_PYTHON="$WORK/nopyserial"
check "case 5a: running with Spike and server" wait_text "$out" "Running." 60
check "case 5a: reports missing pyserial" grep -qF "needs a Python with pyserial" "$out"
check "case 5a: bridge not started" bash -c "! grep -q '^bridge ' '$CALLS'"
collect_launcher 0
check "case 5a: TERM exits 143" [ "$EXIT_CODE" -eq 143 ]

# Case 5b: dongle found, python3 on PATH has pyserial: bridge starts, then stops with the launcher.
make_checkout
out="$WORK/case5b.out"
launch "$out" SLIMEVR_DONGLE_PORT=/dev/cu.test-dongle
check "case 5b: running with bridge" wait_text "$out" "Dongle: bridge started on /dev/cu.test-dongle" 60
bridge_pid=$(call_pid bridge)
check "case 5b: bridge got the dongle port" grep -qF -- "--port /dev/cu.test-dongle" "$CALLS"
collect_launcher 0
check "case 5b: TERM exits 143" [ "$EXIT_CODE" -eq 143 ]
check "case 5b: bridge stopped with the launcher" gone "$bridge_pid"

echo
echo "$PASS passed, $FAILS failed"
[ "$FAILS" -eq 0 ]

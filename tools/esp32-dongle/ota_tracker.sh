#!/bin/bash
# OTA-flash one tracker through the dongle's flash mode (see README "Flash mode").
# Usage: ota_tracker.sh <tracker-ip> <firmware.bin>   (flash mode must already be on: bridge.py --ctl "flash on")
set -euo pipefail
[ $# -eq 2 ] && [ -f "$2" ] || { echo "usage: $0 <tracker-ip 192.168.4.x> <firmware.bin>" >&2; exit 2; }
HERE="$(cd "$(dirname "$0")" && pwd)"
PY="${PYTHON:-python3}"
ESPOTA="$HOME/.platformio/packages/framework-arduinoespressif8266/tools/espota.py"

status="$("$PY" "$HERE/bridge.py" --ctl status)"
case "$status" in *"flash=on"*) ;; *) echo "Flash mode is not on (run: $PY bridge.py --ctl \"flash on\"). Status: $status" >&2; exit 1;; esac
sta_ip="$(sed -n 's/.*sta_ip=\([0-9.]*\).*/\1/p' <<<"$status")"
{ [ -n "$sta_ip" ] && [ "$sta_ip" != "0.0.0.0" ]; } || { echo "Dongle has no sta_ip yet." >&2; exit 1; }

"$PY" "$HERE/bridge.py" --ctl "flash target $1"
sleep 1
# SlimeVR firmware only accepts OTA for 60 s after boot, so power-cycle the tracker, then run this.
# Each espota try waits 10 s for an answer; keep trying for the rest of that window.
for try in 1 2 3 4 5; do
	"$PY" "$ESPOTA" -i "$sta_ip" -p 8266 -a SlimeVR-OTA -f "$2" -d -r && exit 0
	echo "Try $try got no answer; retrying (is the tracker within 60 s of booting?)" >&2
done
exit 1

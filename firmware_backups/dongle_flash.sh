#!/bin/bash
# Save or restore the whole 4 MB flash of the ESP32 USB dongle (tools/esp32-dongle).
#   ./dongle_flash.sh backup  [port]   -> esp32_usb_dongle/esp32_usb_dongle_full_backup.bin (+ .sha256)
#   ./dongle_flash.sh restore [port]   -> writes that image back, after checking its checksum
# Stop bridge.py first: it holds the serial port. 115200 baud because faster reads corrupted on this
# board's CH340 cable, so a backup takes about 6 minutes.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$DIR/esp32_usb_dongle/esp32_usb_dongle_full_backup.bin"
PORT="${2:-$(ls -1 /dev/cu.wchusbserial* /dev/cu.usbserial* 2>/dev/null | head -n 1 || true)}"
[ -n "$PORT" ] || { echo "No ESP32 serial port found. Plug in the dongle."; exit 1; }
if lsof "$PORT" >/dev/null 2>&1; then echo "$PORT is in use (stop bridge.py first)."; exit 1; fi

case "${1:-}" in
backup)
    [ ! -e "$BIN" ] || { echo "$BIN already exists; move it away first."; exit 1; }
    mkdir -p "$(dirname "$BIN")"
    esptool --port "$PORT" -b 115200 read-flash 0x0 0x400000 "$BIN"
    # A second read must match, so a corrupted dump is never kept as the backup.
    esptool --port "$PORT" -b 115200 verify-flash 0x0 "$BIN"
    (cd "$(dirname "$BIN")" && shasum -a 256 "$(basename "$BIN")" > "$(basename "$BIN").sha256")
    echo "Saved and verified: $BIN"
    ;;
restore)
    (cd "$(dirname "$BIN")" && shasum -a 256 -c "$(basename "$BIN").sha256")
    esptool --port "$PORT" -b 115200 write-flash 0x0 "$BIN"
    echo "Dongle firmware restored. Start bridge.py again."
    ;;
*) echo "Usage: $0 backup|restore [port]"; exit 1 ;;
esac

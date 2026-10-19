#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_BIN="$DIR/esp32_slimevr_router_preset/esp32_slimevr_router_full_backup.bin"

if [ ! -f "$BACKUP_BIN" ]; then
    echo "Error: Backup file not found at $BACKUP_BIN"
    exit 1
fi

PORT="${1:-}"
if [ -z "$PORT" ]; then
    PORT=$(ls -1 /dev/cu.usbserial* 2>/dev/null | head -n 1 || true)
fi

if [ -z "$PORT" ]; then
    echo "Error: No ESP32 serial port found! Please plug in your ESP32."
    exit 1
fi

echo "=================================================="
echo " Restoring ESP32 SlimeVR NAT Router Preset"
echo " Target Port: $PORT"
echo " Image: $BACKUP_BIN"
echo "=================================================="

python3 -m esptool --port "$PORT" -b 460800 write_flash 0x0 "$BACKUP_BIN"

echo ""
echo "=================================================="
echo " Restore Complete!"
echo " The ESP32 is now restored with:"
echo "   - SSID: SirJameVR ESP (Open)"
echo "   - Uplink: SirJameVR"
echo "   - Router IP: 192.168.4.1"
echo " Your Slime trackers will reconnect automatically."
echo "=================================================="

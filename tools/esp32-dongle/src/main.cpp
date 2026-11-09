// SlimeVR USB dongle: the ESP32 hosts the tracker Wi-Fi (access point only, no uplink)
// and relays the trackers' UDP over USB serial to bridge.py on the Mac.
// Trackers keep their existing Wi-Fi settings, because the SSID matches the old NAT router.
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <esp_wifi.h>
#include <lwip/lwip_napt.h>
#include <lwip/tcpip.h>
#include <lwip/prot/ip.h>

#include "frame.h"

#ifndef DONGLE_SSID
#define DONGLE_SSID "SirJameVR ESP"
#endif
#ifndef DONGLE_CHANNEL
#define DONGLE_CHANNEL 6
#endif
#ifndef DONGLE_BAUD
#define DONGLE_BAUD 921600
#endif

static const uint16_t SLIME_PORT = 6969;

static WiFiUDP udp;
static frame::Decoder rx;
static uint8_t pkt[frame::MAX_PAYLOAD];
static uint8_t wire[frame::MAX_WIRE];
static uint32_t up, down, upDropped, lastStatus;

// Times the server's pings (packet type 10) over the Wi-Fi leg only, from sending one to
// a tracker until its pong arrives. bridge.py's rtt minus this is the USB + bridge leg.
struct PendingPing {
	uint8_t host;
	uint8_t id[4];
	uint32_t sentUs;
};
static PendingPing pending[16];
static uint32_t wifiRttSumUs, wifiRttMaxUs, wifiRttCount;

static bool isPing(const uint8_t *p, size_t n) {
	return n >= 16 && p[0] == 0 && p[1] == 0 && p[2] == 0 && p[3] == 10;
}

static void notePingSent(uint8_t host, const uint8_t *p) {
	PendingPing &slot = pending[host % 16];
	slot.host = host;
	memcpy(slot.id, p + 12, 4);
	slot.sentUs = micros();
}

static void notePong(uint8_t host, const uint8_t *p) {
	PendingPing &slot = pending[host % 16];
	if (slot.sentUs == 0 || slot.host != host || memcmp(slot.id, p + 12, 4) != 0) return;
	uint32_t rtt = micros() - slot.sentUs;
	slot.sentUs = 0;
	wifiRttSumUs += rtt;
	wifiRttCount++;
	if (rtt > wifiRttMaxUs) wifiRttMaxUs = rtt;
}

// Flash mode (opt-in, never persisted): the AP also joins the house Wi-Fi and NAPTs tracker traffic
// out through it, so the Mac can push OTA updates. "flash off" reboots into the AP-only default.
enum FlashState { FLASH_OFF, FLASH_JOINING, FLASH_ON };
static FlashState flashState = FLASH_OFF;
static IPAddress flashTarget;
static const uint16_t OTA_PORT = 8266;

static void sendFrame(uint8_t type, const uint8_t ip[4], uint16_t port, const uint8_t *p, size_t n) {
	size_t len = frame::encode(type, ip, port, p, n, wire);
	// A full USB queue drops the packet instead of stalling the radio; trackers resend constantly anyway.
	if (len == 0 || Serial.availableForWrite() < (int)len) {
		upDropped++;
		return;
	}
	Serial.write(wire, len);
}

// Runtime baud switch (never persisted): ack at the old rate, switch, revert unless "baud confirm" arrives in time.
static uint32_t curBaud = DONGLE_BAUD, prevBaud = DONGLE_BAUD, baudSwitchedMs;
static bool baudPending;
static const uint32_t BAUD_CONFIRM_MS = 3000;

static bool validBaud(uint32_t r) {
	return r == 460800 || r == 921600 || r == 1000000 || r == 1500000 || r == 2000000;
}

// CONTROL payload: "baud <rate>", "baud confirm", "flash on\n<ssid>\n<pass>", "flash target <ip>", or "flash off".
static void handleControl(const uint8_t *p, size_t n) {
	String cmd((const char *)p, n);
	if (cmd == "baud confirm") {
		baudPending = false;
	} else if (cmd.startsWith("baud ")) {
		uint32_t r = (uint32_t)cmd.substring(5).toInt();
		if (baudPending || !validBaud(r) || r == curBaud) return;
		char ack[24];
		int an = snprintf(ack, sizeof ack, "baud-ack %lu", (unsigned long)r);
		uint8_t none[4] = {0, 0, 0, 0};
		sendFrame(frame::STATUS, none, 0, (const uint8_t *)ack, an);
		Serial.flush(); // the ack leaves at the old rate
		prevBaud = curBaud;
		curBaud = r;
		Serial.updateBaudRate(r); // keeps the RX/TX buffer sizes
		baudSwitchedMs = millis();
		baudPending = true;
	} else if (cmd.startsWith("flash on\n")) {
		int a = cmd.indexOf('\n'), b = cmd.indexOf('\n', a + 1);
		if (flashState != FLASH_OFF || b < 0) return;
		WiFi.persistent(false); // credentials stay in RAM only
		WiFi.mode(WIFI_AP_STA);
		WiFi.begin(cmd.substring(a + 1, b).c_str(), cmd.substring(b + 1).c_str());
		flashState = FLASH_JOINING;
	} else if (cmd.startsWith("flash target ")) {
		IPAddress t;
		if (flashState != FLASH_ON || !WiFi.STA.hasIP() || !t.fromString(cmd.substring(13))) return;
		LOCK_TCPIP_CORE();
		ip_portmap_remove(IP_PROTO_UDP, OTA_PORT);
		ip_portmap_add(IP_PROTO_UDP, (uint32_t)WiFi.localIP(), OTA_PORT, (uint32_t)t, OTA_PORT);
		UNLOCK_TCPIP_CORE();
		flashTarget = t;
	} else if (cmd == "flash off") {
		Serial.flush();
		ESP.restart();
	}
}

void setup() {
	Serial.setRxBufferSize(8192);
	Serial.setTxBufferSize(8192);
	Serial.begin(DONGLE_BAUD);

	WiFi.mode(WIFI_AP);
	WiFi.softAP(DONGLE_SSID, nullptr, DONGLE_CHANNEL, 0, 10);
	esp_wifi_set_ps(WIFI_PS_NONE);
	udp.begin(SLIME_PORT);
}

void loop() {
	// Tracker -> Mac. Trackers learn 192.168.4.1:6969 as "the server" from our replies.
	while (udp.parsePacket() > 0) {
		IPAddress ip = udp.remoteIP();
		uint8_t a[4] = {ip[0], ip[1], ip[2], ip[3]};
		int n = udp.read(pkt, sizeof pkt);
		if (n > 0) {
			if (isPing(pkt, n)) notePong(a[3], pkt);
			sendFrame(frame::FROM_TRACKER, a, udp.remotePort(), pkt, n);
			up++;
		}
	}

	// Mac -> tracker.
	while (Serial.available()) {
		int len = rx.feed((uint8_t)Serial.read());
		if (len >= 0 && rx.type() == frame::CONTROL) handleControl(rx.payload(), len);
		if (len >= 0 && rx.type() == frame::TO_TRACKER) {
			const uint8_t *a = rx.ip();
			if (isPing(rx.payload(), len)) notePingSent(a[3], rx.payload());
			udp.beginPacket(IPAddress(a[0], a[1], a[2], a[3]), rx.port());
			udp.write(rx.payload(), len);
			udp.endPacket();
			down++;
		}
	}

	if (baudPending && millis() - baudSwitchedMs >= BAUD_CONFIRM_MS) {
		baudPending = false;
		curBaud = prevBaud;
		Serial.updateBaudRate(curBaud);
	}

	if (flashState != FLASH_OFF) {
		bool up = WiFi.STA.hasIP();
		if (up && flashState == FLASH_JOINING && WiFi.AP.enableNAPT(true)) flashState = FLASH_ON;
		else if (!up && flashState == FLASH_ON) flashState = FLASH_JOINING; // router dropped us; NAPT stays armed
	}

	if (millis() - lastStatus >= 2000) {
		lastStatus = millis();
		char s[256];
		int n = snprintf(s, sizeof s, "up=%lu down=%lu dropped=%lu bad_frames=%lu clients=%d heap=%lu wifi_rtt_ms=%lu/%lu (avg/max, n=%lu) flash=%s sta_ip=%s target=%s",
			(unsigned long)up, (unsigned long)down, (unsigned long)upDropped, (unsigned long)rx.badFrames,
			WiFi.softAPgetStationNum(), (unsigned long)ESP.getFreeHeap(),
			(unsigned long)(wifiRttCount ? wifiRttSumUs / wifiRttCount / 1000 : 0), (unsigned long)(wifiRttMaxUs / 1000),
			(unsigned long)wifiRttCount, flashState == FLASH_OFF ? "off" : flashState == FLASH_JOINING ? "joining" : "on",
			WiFi.localIP().toString().c_str(), flashTarget.toString().c_str());
		wifiRttSumUs = wifiRttMaxUs = wifiRttCount = 0;
		uint8_t none[4] = {0, 0, 0, 0};
		sendFrame(frame::STATUS, none, 0, (const uint8_t *)s, n);
	}
}

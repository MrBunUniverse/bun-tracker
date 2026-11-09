#!/usr/bin/env python3
"""Auto-flash trackers the moment they are power-cycled (they accept OTA only 60 s after boot).

Needs flash mode on (python3 bridge.py --ctl "flash on"). Then: python3 ota_watch.py firmware.bin --skip 192.168.4.2
A reboot = a 192.168.4.x tracker that went silent (age_ms > 2500) and came back (age_ms < 1000),
or whose packet total went backwards, or an IP seen for the first time after start.
"""
import argparse, glob, json, os, re, subprocess, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
STATS = "http://127.0.0.1:6970/"
LOG = "/tmp/ota-watch.log"
QUEUE_MAX_AGE = 50  # s; the tracker's OTA window is 60 s
MAC_WAIT = 30
MAC_RE = re.compile(r"protocol version:? 23.*?mac:? ([0-9A-Fa-f:]{17})", re.I)


def say(msg):
    line = f"{time.strftime('%H:%M:%S')} {msg}"
    print(line, flush=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")


def trackers():
    with urllib.request.urlopen(STATS, timeout=2) as r:
        return {t["ip"]: t for t in json.load(r)["trackers"] if t["ip"].startswith("192.168.4.")}


def find_mac(ip, since):
    """MAC from the newest server log, lines stamped at/after `since` (epoch)."""
    logs = sorted(glob.glob(os.path.expanduser("~/Library/Logs/dev.slimevr.SlimeVR/*.log")), key=os.path.getmtime)
    if not logs:
        return None
    mac = None
    for line in open(logs[-1], errors="replace"):
        m = MAC_RE.search(line)
        if not m:
            continue
        try:
            if time.mktime(time.strptime(line[:19], "%Y-%m-%d %H:%M:%S")) >= since:
                mac = m.group(1).upper()  # last match wins
        except ValueError:
            pass
    return mac


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("bin")
    ap.add_argument("--skip", nargs="*", default=[], metavar="IP")
    ap.add_argument("--count", type=int)
    ap.add_argument("--dry-run", action="store_true", help="detect and print reboots only; no flash, no flash=on check")
    a = ap.parse_args()
    if not a.dry_run:
        if not os.path.isfile(a.bin):
            sys.exit(f"firmware not found: {a.bin}")
        st = subprocess.run([sys.executable, os.path.join(HERE, "bridge.py"), "--ctl", "status"],
                            capture_output=True, text=True, cwd=HERE).stdout
        m = re.search(r"sta_ip=([\d.]+)", st)
        if "flash=on" not in st or not m or m.group(1) == "0.0.0.0":
            sys.exit(f"Flash mode is not on with a sta_ip (run: python3 bridge.py --ctl \"flash on\"). Status: {st.strip()}")

    done, flashed, failed = set(a.skip), 0, 0
    last = None    # previous poll: ip -> (silent, total)
    state = {}
    queue = {}     # ip -> boot time
    job = None     # (ip, Popen, start, output list)
    macs = []      # (ip, start, deadline)
    say(f"watching (skip={sorted(done)}{', dry-run' if a.dry_run else ''}); power-cycle a tracker")
    try:
        while True:
            try:
                cur = trackers()
            except Exception as e:
                say(f"stats error: {e}")
                time.sleep(2)
                continue
            now = time.time()
            for ip, t in cur.items():
                silent, total = state.get(ip, (None, 0))
                booted = False
                if silent is None:
                    booted = last is not None and t["age_ms"] < 1000  # new IP after start
                elif silent and t["age_ms"] < 1000:
                    booted = True
                elif t["total"] < total:
                    booted = True
                if booted:
                    if ip in done:
                        say(f"{ip} rebooted (already done/skipped)") if a.dry_run else None
                    elif a.dry_run:
                        say(f"rebooted {ip} — would flash")
                    else:
                        queue[ip] = now
                state[ip] = (t["age_ms"] > 2500 or bool(silent and t["age_ms"] >= 1000), t["total"])
            last = cur

            if job and job[1].poll() is not None:
                ip, p, start, out = job
                job = None
                if p.returncode == 0:
                    done.add(ip)
                    flashed += 1
                    say(f"OK {ip}")
                    macs.append((ip, start, time.time() + MAC_WAIT))
                else:
                    failed += 1
                    say("\n".join(out[-8:]))
                    say(f"FAILED {ip}: power-cycle it again")
            for ip, start, deadline in list(macs):
                mac = find_mac(ip, start)
                if mac or time.time() > deadline:
                    macs.remove((ip, start, deadline))
                    say(f"OK {ip} = {mac} now v0.7.4" if mac else f"OK {ip} (MAC not seen in server log yet)")
            if a.count and flashed >= a.count and not job and not macs:
                break
            if not job:
                for ip in sorted(queue, key=queue.get):
                    if now - queue[ip] > QUEUE_MAX_AGE:
                        del queue[ip]
                        say(f"{ip} missed its 60 s window — power-cycle it again")
                    else:
                        del queue[ip]
                        say(f"rebooted {ip} — flashing")
                        p = subprocess.Popen(["bash", os.path.join(HERE, "ota_tracker.sh"), ip, a.bin],
                                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=HERE)
                        out = []
                        import threading
                        threading.Thread(target=lambda: [out.append(l.rstrip()) for l in p.stdout], daemon=True).start()
                        job = (ip, p, now, out)
                        break
            time.sleep(0.5)
    except KeyboardInterrupt:
        if job:
            job[1].terminate()
    say(f"summary: {flashed} flashed, {failed} failed, done={sorted(done)}")


if __name__ == "__main__":
    main()

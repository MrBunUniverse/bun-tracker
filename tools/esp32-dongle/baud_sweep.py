#!/usr/bin/env python3
"""Compare dongle<->bridge serial baud rates while trackers stream (stdlib only).

python3 baud_sweep.py [--rates 2000000 1500000 1000000 921600] [--secs 180] [--end-rate N]
Needs the running bridge (stats on 127.0.0.1:6970, control via bridge.py --ctl). Appends the table to /tmp/baud-sweep.log.
Ctrl+C switches back to 2000000 before exiting.
"""
import argparse
import json
import os
import statistics
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = "/tmp/baud-sweep.log"
DEFAULT = 2000000


def stats():
    with urllib.request.urlopen("http://127.0.0.1:6970", timeout=3) as r:
        return json.load(r)


def switch(rate):
    """True once the bridge reports the new rate as confirmed."""
    if stats()["baud"] == rate:
        return True
    out = subprocess.run([sys.executable, os.path.join(HERE, "bridge.py"), "--ctl", f"baud {rate}"], capture_output=True, text=True).stdout
    if not out.startswith("sent"):
        return False
    time.sleep(1.5)  # stats are published once a second; skip the stale snapshot
    for _ in range(14):  # the bridge gives up after 4 s
        time.sleep(0.5)
        d = stats()
        if d["baud"] == rate and d["baud_result"].startswith("ok"):
            return True
        if d["baud_result"].startswith("failed"):
            return False
    return False


def measure(rate, secs):
    time.sleep(5)  # settle
    first = last = stats()
    rtts, rtt_max, gap_max, count = [], 0, 0, 0
    end = time.time() + secs
    while time.time() < end:
        time.sleep(2)
        last = stats()
        live = [t for t in last["trackers"] if t["ip"].startswith("192.168.4.") and t["age_ms"] < 2000]
        count = len(live)
        rtts += [t["rtt_avg"] for t in live if t["rtt_avg"] is not None]
        rtt_max = max([rtt_max] + [t["rtt_max"] or 0 for t in live])
        gap_max = max([gap_max] + [t["gap_max_ms"] for t in live])
    up, bad = last["up"] - first["up"], last["bad_frames"] - first["bad_frames"]
    return {"rate": rate, "up": up, "bad": bad, "bad_pct": 100 * bad / max(1, up + bad),
            "med": statistics.median(rtts) if rtts else float("inf"),
            "p95": sorted(rtts)[min(len(rtts) - 1, int(0.95 * len(rtts)))] if rtts else float("inf"),
            "rtt_max": rtt_max, "gap": gap_max, "trackers": count}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rates", type=int, nargs="+", default=[2000000, 1500000, 1000000, 921600])
    ap.add_argument("--secs", type=int, default=180)
    ap.add_argument("--end-rate", type=int, help="default: the best rate")
    args = ap.parse_args()
    results, failed = [], []
    try:
        for rate in args.rates:
            if not switch(rate):
                failed.append(rate)
                print(f"{rate}: failed", flush=True)
                continue
            results.append(measure(rate, args.secs))
            print(f"{rate}: done", flush=True)
    except KeyboardInterrupt:
        print("\ninterrupted, back to", DEFAULT)
        switch(DEFAULT)
        return
    lines = [f"--- {time.strftime('%F %T')} secs={args.secs}",
             f"{'baud':>8} {'up':>7} {'bad':>5} {'bad%':>6} {'rtt med':>8} {'rtt p95':>8} {'rtt max':>8} {'gap max':>8} {'trk':>3}"]
    lines += [f"{r['rate']:>8} {r['up']:>7} {r['bad']:>5} {r['bad_pct']:>6.2f} {r['med']:>8.1f} {r['p95']:>8.1f} {r['rtt_max']:>8} {r['gap']:>8} {r['trackers']:>3}" for r in results]
    lines += [f"{r:>8} failed" for r in failed]
    best = min(results, key=lambda r: (r["bad_pct"], r["med"]))["rate"] if results else DEFAULT
    end = args.end_rate or best
    lines.append(f"best={best} end={end}" + ("" if switch(end) else " (end switch FAILED)"))
    print("\n".join(lines))
    with open(LOG, "a") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()

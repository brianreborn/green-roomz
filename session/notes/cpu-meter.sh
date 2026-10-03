#!/usr/bin/env python3
"""CPU-first pane: several history rows per core so the pane fills."""
import os, time, shutil
from collections import deque
from datetime import datetime
from zoneinfo import ZoneInfo

def read_cores():
    rows = []
    with open("/proc/stat") as f:
        for line in f:
            if line.startswith("cpu") and line[3:4].isdigit():
                p = line.split()
                nums = list(map(int, p[1:]))
                idle = nums[3] + (nums[4] if len(nums) > 4 else 0)
                total = sum(nums)
                rows.append((idle, total))
    return rows

def mem_line():
    info = {}
    with open("/proc/meminfo") as f:
        for line in f:
            k, v, *rest = line.split()
            info[k.rstrip(":")] = int(v)
    tot = info.get("MemTotal", 1) / 1024 / 1024
    avail = info.get("MemAvailable", 0) / 1024 / 1024
    used = tot - avail
    return f"mem {used:.1f}/{tot:.1f}G  avail {avail:.1f}G"

def bar(pct, width):
    width = max(8, width)
    filled = max(0, min(width, round(pct * width / 100)))
    return "#" * filled + "-" * (width - filled)

def main():
    os.environ.setdefault("TERM", "xterm-256color")
    prev = read_cores()
    n = len(prev)
    hist = [deque(maxlen=400) for _ in range(n)]
    time.sleep(0.25)
    print("\033[?25l", end="", flush=True)
    try:
        while True:
            cols, lines = shutil.get_terminal_size((80, 24))
            cur = read_cores()
            pcts = []
            for i in range(n):
                di = cur[i][0] - prev[i][0]
                dt = cur[i][1] - prev[i][1]
                p = 0.0 if dt <= 0 else max(0.0, min(100.0, 100.0 * (dt - di) / dt))
                pcts.append(p)
                hist[i].append(p)
            prev = cur
            header = 1  # title only
            usable = max(n, lines - header)
            rows_each = max(2, usable // n)  # at least label+1 history
            # spend leftover rows on extra history
            leftover = usable - rows_each * n
            out = ["\033[H\033[J" + f"CPU  {datetime.now(ZoneInfo('America/Los_Angeles')).strftime('%H:%M:%S PT')}  {n} cores"]
            bar_w = max(10, cols - 10)
            spark_w = max(8, cols - 4)
            for i, p in enumerate(pcts):
                extra = 1 if i < leftover else 0
                hrows = rows_each - 1 + extra
                out.append(f"c{i:<2} {p:5.1f}% {bar(p, bar_w)}")
                samples = list(hist[i])
                if not samples:
                    continue
                # newest at right; each history row is a time-compressed sparkline
                take = min(len(samples), spark_w)
                window = samples[-take:]
                # draw hrows as stacked density: row 0 = highest band
                for r in range(hrows):
                    # row r shows whether sample was in the upper fraction of this row's band
                    lo = 100.0 * (hrows - r - 1) / hrows
                    hi = 100.0 * (hrows - r) / hrows
                    chars = []
                    for v in window:
                        if v >= hi:
                            chars.append(":")
                        elif v >= lo:
                            chars.append("|")
                        else:
                            chars.append(" ")
                    pad = " " * max(0, spark_w - len(chars))
                    out.append("    " + pad + "".join(chars))
            # trim/pad to terminal height
            out = out[:lines]
            print("\n".join(out), end="", flush=True)
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\033[?25h")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""A57 join preflight. READ-ONLY unless PREFLIGHT_LIFETIME=1.
Run in Termux on the phone:  python3 a57_preflight.py [expected-hostname]
Env: ANDROID_DIR, GRZ_RUNTIME, GRZ_PORT (8080), NEXUS_HOST, PREFLIGHT_LIFETIME.
Sections: RD = Release Driver, PR = Platform Reviewer, CO = Continuity.
Stdlib only."""
import glob, hashlib, os, re, socket, subprocess, sys, time

PIN_SHA = "afb8deb247271dd0b62301dbc7768a2d9eda2e2bb2966a57f81018c6e2aa3136"
HOME = os.environ.get("HOME", "")
ROOT = os.environ.get("ANDROID_DIR") or os.path.join(HOME, "green-roomz")
RT = os.environ.get("GRZ_RUNTIME") or os.path.join(ROOT, "grz-runtime")
PORT = int(os.environ.get("GRZ_PORT", "8080"))
START = os.path.join(ROOT, "start-green-roomz.sh")
fails = 0

def ok(m): print("PASS", m)
def info(m): print("INFO", m)
def bad(m):
    global fails; fails += 1; print("FAIL", m)
def check(c, good, badm): ok(good) if c else bad(badm)

def listening(port):
    """Listening on port? Reads /proc/net/tcp{,6}; no ss/netstat needed."""
    hx = ":%04X" % port
    for f in ("/proc/net/tcp", "/proc/net/tcp6"):
        try:
            for line in open(f).readlines()[1:]:
                p = line.split()
                if p[1].endswith(hx) and p[3] == "0A":
                    return True
        except OSError:
            pass
    return False

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for b in iter(lambda: fh.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()

def llama_pids():
    out = []
    for d in glob.glob("/proc/[0-9]*"):
        try:
            cmd = open(d + "/cmdline", "rb").read()
        except OSError:
            continue
        if b"llama-server" in cmd and int(d[6:]) != os.getpid():
            out.append(int(d[6:]))
    return out

def ppid(pid):
    try:
        for l in open("/proc/%d/status" % pid):
            if l.startswith("PPid:"):
                return int(l.split()[1])
    except OSError:
        return None

def tcp_open(host, port, t=3.0):
    try:
        socket.create_connection((host, port), timeout=t).close(); return True
    except OSError:
        return False

def rd(exp_host):
    print("## RD: start folder, pack hash, sshd, hostname, start log")
    check(os.path.isdir(ROOT), "root " + ROOT, "root missing " + ROOT)
    check(os.access(START, os.X_OK), "start script executable", "start script missing or not +x")
    if os.path.isdir("/data/local/tmp/grz"):
        info("old /data/local/tmp/grz present (stale deploy?)")
    pf = os.path.join(ROOT, ".pack-sha256")
    if os.path.isfile(pf):
        got = open(pf).read().strip()
        check(got == PIN_SHA, "pack hash pinned", "pack hash %s != pinned" % got)
    else:
        bad("no .pack-sha256 (pack version unknown)")
    check(listening(8022), "sshd :8022", "sshd not listening on :8022")
    h = socket.gethostname(); info("hostname=" + h)
    if exp_host:
        check(h == exp_host, "hostname pin", "hostname %s != %s" % (h, exp_host))
    logs = sorted(glob.glob(os.path.join(ROOT, "logs", "*.log")), key=os.path.getmtime)
    if not logs:
        bad("no start log"); return
    info("log " + logs[-1]); keep = []
    for line in open(logs[-1], errors="replace"):
        keep.append(line.rstrip("\n"))
        if "join" in line.lower():
            break
    for l in keep[-40:]:
        print("  | " + l)

def pr():
    print("## PR: tmp, lib/.so, launcher, locale, /data/local/tmp refs, leftover llama-server")
    prefix = os.environ.get("PREFIX", "")
    for d in (os.environ.get("TMPDIR", ""), prefix + "/tmp" if prefix else ""):
        if not d or d == "/tmp":
            bad("tmp dir unset: '%s'" % d); continue
        check(os.path.isdir(d) and os.access(d, os.W_OK), "writable " + d, "not writable " + d)
    if os.environ.get("TMPDIR", "").startswith("/data/local/tmp"):
        bad("TMPDIR points at /data/local/tmp")
    b, l = os.path.join(RT, "bin"), os.path.join(RT, "lib")
    if os.path.isdir(b) and os.path.isdir(l):
        sos = [f for f in os.listdir(b) if re.match(r"lib(ggml|llama).*\.so", f)]
        if not sos:
            info("no ggml/llama .so in bin/ (lib-only layout)")
        for f in sos:
            lf = os.path.join(l, f)
            if os.path.isfile(lf):
                check(sha256(os.path.join(b, f)) == sha256(lf), "so match " + f, "so MISMATCH bin/lib " + f)
            else:
                info(f + " only in bin/")
    else:
        bad("grz-runtime bin/ or lib/ missing under " + RT)
    launchers = [START] + glob.glob(os.path.join(RT, "bin", "*launch*")) + glob.glob(os.path.join(ROOT, "*launch*"))
    for f in launchers:
        if not os.path.isfile(f):
            continue
        n = os.path.relpath(f, ROOT); data = open(f, "rb").read()
        check(os.access(f, os.X_OK), "+x " + n, "not +x " + n)
        check(b"\r" not in data, "LF " + n, "CRLF in " + n)
        if data.startswith(b"\xef\xbb\xbf"):
            bad("BOM in " + n)
        sb = data.split(b"\n", 1)[0].decode(errors="replace")
        if sb.startswith("#!/data/data/com.termux/files/usr/bin/") or sb.startswith("#!/usr/bin/env "):
            ok("shebang " + n)
        elif sb.startswith("#!/bin/") or sb.startswith("#!/usr/bin/"):
            if os.path.exists(prefix + "/lib/libtermux-exec.so"):
                info("shebang %s ok via termux-exec (%s)" % (sb, n))
            else:
                bad("shebang %s needs termux-exec, missing (%s)" % (sb, n))
        else:
            bad("bad shebang '%s' in %s" % (sb, n))
    for v in ("LANG", "LC_ALL"):
        val = os.environ.get(v, "")
        if re.search(r"utf-?8", val, re.I):
            ok("%s=%s" % (v, val))
        elif v == "LC_ALL" and not val:
            info("LC_ALL unset")
        else:
            bad("%s not UTF-8 ('%s')" % (v, val))
    hits = []
    for f in glob.glob(os.path.join(ROOT, "*.sh")) + glob.glob(os.path.join(ROOT, "config*")) + glob.glob(os.path.join(RT, "bin", "*")):
        try:
            if os.path.isfile(f) and b"/data/local/tmp" in open(f, "rb").read():
                hits.append(f)
        except OSError:
            pass
    check(not hits, "no /data/local/tmp refs", "/data/local/tmp referenced: " + " ".join(hits[:5]))
    pids = llama_pids()
    if not pids:
        info("no llama-server running")
    for p in pids:
        pp = ppid(p); info("llama-server pid=%d ppid=%s" % (p, pp))
        if pp in (None, 1) or not os.path.isdir("/proc/%d" % pp):
            bad("orphaned llama-server pid=%d (parent %s)" % (p, pp or "gone"))
    if listening(PORT):
        check(bool(pids), ":%d held by running serve" % PORT, ":%d held but no llama-server (stale holder)" % PORT)
    else:
        info(":%d not listening" % PORT)
    if os.environ.get("PREFLIGHT_LIFETIME") == "1":
        info("PREFLIGHT_LIFETIME=1: running stop/restart (touches the node)"); lifetime()
    else:
        info("lifetime check skipped (set PREFLIGHT_LIFETIME=1)")

def lifetime():
    """Bug L1: leftover llama-server after SIGTERM. Opt-in only."""
    if not os.access(START, os.X_OK):
        bad("L1: no start script"); return
    subprocess.run([START, "stop"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(10):
        if not llama_pids(): break
        time.sleep(1)
    left = llama_pids()
    check(not left, "L1: no llama-server after stop", "L1: llama-server survived stop: %s" % left)
    if listening(PORT):
        bad("L1: :%d still held after stop" % PORT)
    subprocess.Popen([START, "start"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    for _ in range(30):
        if listening(PORT): break
        time.sleep(1)
    check(listening(PORT), "L1: restart listening :%d" % PORT, "L1: restart not listening after 30s")

def co():
    print("## CO: tunnel probes")
    h = os.environ.get("NEXUS_HOST", "127.0.0.1")
    for port in (18080, 18081):
        check(tcp_open(h, port), "tunnel :%d reachable (%s)" % (port, h), "tunnel :%d closed (%s)" % (port, h))

def main():
    rd(sys.argv[1] if len(sys.argv) > 1 else "")
    pr(); co()
    print("fails=%d" % fails)
    return 1 if fails else 0

if __name__ == "__main__":
    sys.exit(main())

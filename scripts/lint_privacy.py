#!/usr/bin/env python3
"""Privacy lint for public files (issue #28).

Fails closed: any finding, any unreadable file, or any error makes the exit
status non-zero.  Checked classes:

  * private IPv4: RFC 1918, link-local, CGNAT (shared address space), and
    every other non-loopback address outside the RFC 5737 documentation ranges
  * private IPv6: link-local, unique-local, site-local, and IPv4-mapped forms
    of any blocked IPv4 address
  * user home paths: /home/<name>, /Users/<name>, C:\\Users\\<name>, ~name/
  * private fleet hostnames
  * personal e-mail addresses and @localhost authors
  * MAC addresses outside the RFC 7042 documentation block

Allowed: loopback, the unspecified address, RFC 5737 documentation ranges,
2001:db8::/32, and placeholder user names such as <user> or $USER.

Usage:
  python3 scripts/lint_privacy.py            # files git would publish
  python3 scripts/lint_privacy.py --all      # every file under the root
  python3 scripts/lint_privacy.py PATH ...   # just these files

Only .git and the gitignored private override files are skipped.
"""
from __future__ import annotations

import argparse
import hashlib
import ipaddress
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

# Private override files: gitignored, never published, never scanned.
OVERRIDE_NAMES = frozenset({"local.env", "hosts.local.json", "private.env",
                            "privacy-hosts.local.txt"})
SKIP_DIRS = frozenset({".git"})

DOC_NETS = tuple(
    ipaddress.ip_network(n)
    for n in (
        "192.0.2.0/24",      # RFC 5737 TEST-NET-1
        "198.51.100.0/24",   # RFC 5737 TEST-NET-2
        "203.0.113.0/24",    # RFC 5737 TEST-NET-3
        "2001:db8::/32",     # RFC 3849
    )
)


def _v4(a: int, b: int, c: int, d: int, plen: int) -> ipaddress.IPv4Network:
    # Built from parts so this file does not trip its own check.
    return ipaddress.IPv4Network(f"{a}.{b}.{c}.{d}/{plen}")


NAMED_V4 = (
    ("rfc1918", _v4(10, 0, 0, 0, 8)),
    ("rfc1918", _v4(172, 16, 0, 0, 12)),
    ("rfc1918", _v4(192, 168, 0, 0, 16)),
    ("link-local", _v4(169, 254, 0, 0, 16)),
    ("cgnat", _v4(100, 64, 0, 0, 10)),
)
NAMED_V6 = (
    ("link-local", ipaddress.IPv6Network((0xFE80 << 112, 10))),
    ("ula", ipaddress.IPv6Network((0xFC00 << 112, 7))),
    ("site-local", ipaddress.IPv6Network((0xFEC0 << 112, 10))),
)

# Private fleet host names are not spelled out in this public file: only their
# SHA-256 digests (lower-case) are listed.  Extra names can be added, one per
# line, in the gitignored scripts/privacy-hosts.local.txt.  phone<N> is generic.
PRIVATE_HOST_SHA256 = frozenset({
    "3fe65b4eb6aa8bcf9ba1e64d5d067428d296316e0c17ab11091f40f49273f98a",
    "519ba91a5a5b4afb9dc66f8805ce8c442b6576316c19c6896af2fa9bda6aff71",
    "364d9b25b5a25c291f1bcde1483d637cd468f79b72c836e7ae0b5907f9bddf8b",
    "9b26c65fe33bf161eea7edd9f1e361783a2ee985b8d5036ddc5b6029f957cd0d",
    "eba4ae33f54ae0f96bed25bfc13abd887ae157380330cd3fd3f0a4d054ce3a3f",
    "7fcd3df7dc2fff173c22ea6450ede4f11b3e27c7923816aab660d474e27df8c2",
    "a3cc5178e6288f9b0e35c329561b6f6178d89f0ce996412378d135c5b94551f7",
    "39f307f909476de5b24fba3591952a5c8a2eb919b298f0473078154b5eab6cac",
})
HOSTS_LOCAL_FILE = "privacy-hosts.local.txt"
PHONE_RE = re.compile(r"(?<![A-Za-z0-9])(phone\d+)(?![A-Za-z])", re.IGNORECASE)
# Word tokens: letters with optional trailing digits (e.g. abc9), split on
# anything else, so names inside paths, identifiers and kebab-case are seen.
TOKEN_RE = re.compile(r"[A-Za-z]+[0-9]*")


def _digest(word: str) -> str:
    return hashlib.sha256(word.lower().encode("utf-8")).hexdigest()


def load_extra_hosts(root: Path) -> frozenset[str]:
    f = root / "scripts" / HOSTS_LOCAL_FILE
    if not f.exists():
        return frozenset()
    names = set()
    for line in f.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip().lower()
        if line:
            names.add(_digest(line))
    return frozenset(names)


IPV4_RE = re.compile(r"(?<![\w.])(\d{1,3}(?:\.\d{1,3}){3})(?![\w]|\.\d)")
IPV6_RE = re.compile(r"(?<![\w:.])([0-9A-Fa-f]{0,4}(?::[0-9A-Fa-f]{0,4}){2,7}"
                     r"(?:%[\w.]+)?)(?![\w:])")

PLACEHOLDER_USERS = frozenset({
    "user", "<user>", "username", "<username>", "you", "me", "example",
    "$user", "${user}", "%username%", "$env:username", "public", "default",
    "runner", "...", "<name>", "name", "$(whoami)",
})
# The name token is either a <placeholder>, a $VAR / ${VAR} / %VAR% /
# $env:VAR reference, or a plain user-name-like word.
_NAME = r"(<[^>\s/\\]+>|\$\{[^}]+\}|\$env:\w+|\$\(\w+\)|\$\w+|%\w+%|\.\.\.|[\w.-]+)"
HOME_RES = (
    ("home-path", re.compile(r"(?<![\w$])/home/" + _NAME)),
    ("home-path", re.compile(r"(?<![\w$])/Users/" + _NAME)),
    ("home-path", re.compile(r"(?<![\w])[A-Za-z]:(?:\\{1,2}|/)Users(?:\\{1,2}|/)" + _NAME,
                             re.IGNORECASE)),
    ("home-path", re.compile(r"(?<![\w~/$])~([a-z_][a-z0-9_-]*)(?=/)")),
)

MAC_RE = re.compile(r"(?<![0-9A-Fa-f:-])((?:[0-9A-Fa-f]{2}([:-]))(?:[0-9A-Fa-f]{2}\2){4}[0-9A-Fa-f]{2})"
                    r"(?![0-9A-Fa-f:-])")
# RFC 7042 documentation block for EUI-48, plus all-zero / broadcast.
_MAC_DOC_PREFIX = "00005e0053"
_MAC_ALLOWED = frozenset({"000000000000", "ffffffffffff"})

EMAIL_RE = re.compile(r"(?<![\w.+-])([\w.+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*))")
ALLOWED_EMAIL_DOMAINS = ("users.noreply.github.com", "example.com", "example.org",
                         "example.net", "example")
ALLOWED_EMAILS = frozenset({"git@github.com", "noreply@github.com",
                            "noreply@anthropic.com"})


@dataclass(frozen=True)
class Finding:
    path: str
    line: int
    kind: str
    text: str

    def __str__(self) -> str:
        return f"{self.path}:{self.line}: {self.kind}: {self.text}"


def _v4_class(ip: ipaddress.IPv4Address) -> str | None:
    if ip.is_loopback or ip.is_unspecified:
        return None
    if any(ip in n for n in DOC_NETS):
        return None
    for name, net in NAMED_V4:
        if ip in net:
            return name
    if ip == ipaddress.IPv4Address("255.255.255.255") or ip.is_multicast:
        return None
    if ip.is_reserved:
        return None
    return "non-doc-ipv4"


def _v6_class(ip: ipaddress.IPv6Address) -> str | None:
    if ip.is_loopback or ip.is_unspecified:
        return None
    if any(ip in n for n in DOC_NETS):
        return None
    mapped = ip.ipv4_mapped
    if mapped is not None:
        c = _v4_class(mapped)
        return f"{c}(v4-mapped)" if c else None
    for name, net in NAMED_V6:
        if ip in net:
            return name
    return None


def _email_ok(addr: str, domain: str) -> bool:
    a, d = addr.lower(), domain.lower()
    if a in ALLOWED_EMAILS:
        return True
    if d == "localhost":
        return False
    if "." not in d:
        # npm-style scopes/versions (pkg@1), decorators, ssh user@host shorthand
        # without a dotted domain are not mail addresses; hosts are caught
        # by the hostname/IP rules.
        return True
    return any(d == x or d.endswith("." + x) for x in ALLOWED_EMAIL_DOMAINS)


_ALPHA_TLD = re.compile(r"\.[A-Za-z]{2,}$")


def scan_text(text: str, path: str = "<text>",
              extra_hosts: frozenset[str] = frozenset(),
              binary: bool = False) -> list[Finding]:
    out: list[Finding] = []
    for lineno, line in enumerate(text.splitlines(), 1):
        for m in IPV4_RE.finditer(line):
            try:
                ip = ipaddress.IPv4Address(m.group(1))
            except ValueError:
                continue
            c = _v4_class(ip)
            if c:
                out.append(Finding(path, lineno, c, m.group(1)))
        for m in IPV6_RE.finditer(line):
            cand = m.group(1).split("%", 1)[0]
            if cand.count(":") < 2:
                continue
            try:
                ip6 = ipaddress.IPv6Address(cand)
            except ValueError:
                continue
            c = _v6_class(ip6)
            if c:
                out.append(Finding(path, lineno, c, m.group(1)))
        for kind, rx in HOME_RES:
            if binary and rx is HOME_RES[-1][1]:
                continue  # tilde-name in binary runs is compression noise
            for m in rx.finditer(line):
                if m.group(1).lower() not in PLACEHOLDER_USERS:
                    out.append(Finding(path, lineno, kind, m.group(0)))
        for m in MAC_RE.finditer(line):
            mac = re.sub(r"[:-]", "", m.group(1)).lower()
            if mac not in _MAC_ALLOWED and not mac.startswith(_MAC_DOC_PREFIX):
                out.append(Finding(path, lineno, "mac-address", m.group(1)))
        for m in PHONE_RE.finditer(line):
            out.append(Finding(path, lineno, "private-host", m.group(1)))
        for m in TOKEN_RE.finditer(line):
            tok = m.group(0)
            if len(tok) < 4:
                continue
            d = _digest(tok)
            if d in PRIVATE_HOST_SHA256 or d in extra_hosts:
                out.append(Finding(path, lineno, "private-host", tok))
        for m in EMAIL_RE.finditer(line):
            addr, dom = m.group(1), m.group(2)
            if dom.lower() != "localhost" and not _ALPHA_TLD.search(dom):
                continue  # pkg@1.2.3 pins, agent@model-1.5b ids: not mail domains
            if not _email_ok(addr, dom):
                out.append(Finding(path, lineno, "email", addr))
    return out


_PRINTABLE_RUN = re.compile(rb"[\x20-\x7e]{8,}")


def scan_file(path: Path, display: str | None = None,
              extra_hosts: frozenset[str] = frozenset()) -> list[Finding]:
    disp = display or str(path)
    try:
        data = path.read_bytes()
    except OSError as e:
        return [Finding(disp, 0, "unreadable", e.__class__.__name__)]
    binary = b"\0" in data[:8192]
    if binary:
        # Binary (images, archives): scan printable runs of 8+ bytes, like
        # strings(1), one run per line.  Short runs are compression noise.
        text = "\n".join(m.group(0).decode("ascii")
                         for m in _PRINTABLE_RUN.finditer(data))
    else:
        text = data.decode("utf-8", errors="replace")
    findings = scan_text(text, disp, extra_hosts, binary)
    # The file name itself is published too.  For an absolute path given on
    # the command line only the base name is a published name.
    name = Path(disp).name if os.path.isabs(disp) else disp.replace("\\", "/")
    for f in scan_text(name, disp, extra_hosts):
        findings.append(Finding(disp, 0, "path-" + f.kind, f.text))
    return findings


def _is_override(rel: str) -> bool:
    return Path(rel).name in OVERRIDE_NAMES


def git_files(root: Path) -> list[str]:
    res = subprocess.run(
        ["git", "-C", str(root), "ls-files", "-z", "--cached", "--others",
         "--exclude-standard"],
        capture_output=True, check=True,
    )
    names = [n.decode("utf-8", "surrogateescape")
             for n in res.stdout.split(b"\0") if n]
    return sorted(set(names))


def walk_files(root: Path) -> list[str]:
    out = []
    for dp, dns, fns in os.walk(root, onerror=_raise):
        dns[:] = [d for d in dns if d not in SKIP_DIRS]
        for fn in fns:
            out.append(os.path.relpath(os.path.join(dp, fn), root))
    return sorted(out)


def _raise(err: OSError) -> None:
    raise err


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("paths", nargs="*", help="files to scan (default: repo)")
    ap.add_argument("--root", default=None, help="repo root (default: script/..)")
    ap.add_argument("--all", action="store_true",
                    help="walk every file, not just what git would publish")
    args = ap.parse_args(argv)

    root = Path(args.root) if args.root else Path(__file__).resolve().parent.parent
    try:
        if args.paths:
            rels = list(args.paths)
            base = Path(".")
        else:
            base = root
            rels = walk_files(root) if args.all else git_files(root)
    except (OSError, subprocess.CalledProcessError) as e:
        print(f"lint_privacy: cannot list files: {e}", file=sys.stderr)
        return 2

    try:
        extra_hosts = load_extra_hosts(root)
    except (OSError, UnicodeDecodeError) as e:
        print(f"lint_privacy: cannot read {HOSTS_LOCAL_FILE}: {e}", file=sys.stderr)
        return 2
    findings: list[Finding] = []
    scanned = 0
    for rel in rels:
        parts = Path(rel).parts
        if any(p in SKIP_DIRS for p in parts) or _is_override(rel):
            continue
        p = base / rel
        if p.is_symlink():
            # Scan the link target text, never follow it outside the tree.
            try:
                findings += scan_text(os.readlink(p), rel, extra_hosts)
            except OSError as e:
                findings.append(Finding(rel, 0, "unreadable", e.__class__.__name__))
            scanned += 1
            continue
        if not p.exists():
            if args.paths:
                findings.append(Finding(rel, 0, "unreadable", "missing"))
            continue  # deleted in the work tree but still in the index
        findings += scan_file(p, rel, extra_hosts)
        scanned += 1

    for f in findings:
        print(f)
    if findings:
        print(f"lint_privacy: FAIL, {len(findings)} finding(s) in {scanned} file(s)",
              file=sys.stderr)
        return 1
    print(f"lint_privacy: OK, {scanned} file(s) clean", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

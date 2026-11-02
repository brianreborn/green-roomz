"""pytest suite for scripts/lint_privacy.py (issue #28).

Fixture addresses are assembled at run time so this public file stays clean
under the lint it tests.  Scratch files live in a private mkdtemp directory
under the user's cache dir (never /tmp) and are removed afterwards.
"""
from __future__ import annotations

import hashlib
import importlib.util
import os
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "lint_privacy.py"
_spec = importlib.util.spec_from_file_location("lint_privacy", SCRIPT)
lp = importlib.util.module_from_spec(_spec)
sys.modules["lint_privacy"] = lp
_spec.loader.exec_module(lp)


def dot(*parts: int) -> str:
    return ".".join(str(p) for p in parts)


def kinds(text: str, **kw) -> list[str]:
    return [f.kind for f in lp.scan_text(text, **kw)]


@pytest.fixture
def scratch():
    base = Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache") / "green-roomz-tests"
    base.mkdir(parents=True, exist_ok=True, mode=0o700)
    d = Path(tempfile.mkdtemp(prefix="lint-privacy.", dir=base))
    try:
        yield d
    finally:
        for p in d.rglob("*"):
            try:
                p.chmod(stat.S_IRWXU)
            except OSError:
                pass
        shutil.rmtree(d, ignore_errors=True)


# --- blocked classes --------------------------------------------------------

@pytest.mark.parametrize("addr", [
    dot(10, 1, 2, 3), dot(172, 16, 0, 9), dot(172, 31, 255, 1), dot(192, 168, 1, 7),
])
def test_rfc1918_fails(addr):
    assert kinds(f"host {addr}:8080 up") == ["rfc1918"]


def test_link_local_v4_fails():
    assert kinds(f"apipa {dot(169, 254, 3, 4)}") == ["link-local"]


@pytest.mark.parametrize("addr", [dot(100, 64, 0, 1), dot(100, 127, 255, 254)])
def test_cgnat_fails(addr):
    assert kinds(f"tailnet {addr}") == ["cgnat"]


def test_cgnat_edges_are_public_not_cgnat():
    # Just outside 100.64/10: not CGNAT, but still not a doc address.
    assert kinds(dot(100, 63, 255, 255)) == ["non-doc-ipv4"]
    assert kinds(dot(100, 128, 0, 0)) == ["non-doc-ipv4"]


def test_public_non_doc_ipv4_fails():
    assert kinds(f"dns {dot(8, 8, 4, 4)}") == ["non-doc-ipv4"]


@pytest.mark.parametrize("addr,kind", [
    ("fe80" + "::1%eth0", "link-local"),
    ("fe80" + "::abcd:1", "link-local"),
    ("fd12:3456" + "::1", "ula"),
    ("fc00" + "::5", "ula"),
    ("::ffff:" + dot(192, 168, 0, 5), "rfc1918"),
    ("::ffff:" + "c0a8:5", "rfc1918(v4-mapped)"),
])
def test_ipv6_private_fails(addr, kind):
    assert kinds(f"peer [{addr}] ok") == [kind]


@pytest.mark.parametrize("path", [
    "/home/" + "alice/models",
    "/Users/" + "bob/Library",
    "C:\\" + "Users\\carol\\Documents",
    "C:\\\\" + "Users\\\\carol\\\\x",
    "c:/" + "users/dave/x",
    "~" + "erin/.ssh",
])
def test_home_paths_fail(path):
    assert kinds(f"see {path}") == ["home-path"]


@pytest.mark.parametrize("path", [
    "/home/<user>/x", "/home/$USER/x", "/home/${USER}/x", "/Users/<user>/x",
    "C:\\Users\\%USERNAME%\\x", "C:\\Users\\Public\\x", "~/x", "$HOME/x",
    "${GREEN_ROOMZ_HOME}/data", "%USERPROFILE%\\Documents",
])
def test_home_placeholders_pass(path):
    assert kinds(path) == []


def test_private_hosts_builtin_list_is_hashed_only():
    assert len(lp.PRIVATE_HOST_SHA256) == 8
    assert all(len(h) == 64 for h in lp.PRIVATE_HOST_SHA256)


def test_private_host_from_extra_list_fails_in_any_case_and_inside_paths():
    extra = frozenset({hashlib.sha256(b"zorblax").hexdigest()})
    for text in ("ssh zorblax", "ZorBlax ready", "deploy/zorblax/start.ps1", "zorblax-start"):
        assert "private-host" in kinds(text, extra_hosts=extra), text
    assert kinds("zorblaxed", extra_hosts=extra) == []


@pytest.mark.parametrize("name", ["pho" + "ne1", "Pho" + "ne12", "adb to pho" + "ne3:5555"])
def test_phone_n_fails(name):
    assert "private-host" in kinds(name)


@pytest.mark.parametrize("addr", [
    "someone@" + "gmail.com", "Author <dev@" + "localhost>", "a.b@" + "corp.example.io",
])
def test_personal_email_fails(addr):
    assert kinds(addr) == ["email"]


@pytest.mark.parametrize("addr", [
    "brianreborn@users.noreply.github.com", "git@github.com", "ops@example.com",
    "pkg@1.2.3", "vision-layout-agent@qwen2.5-vl-3b",
])
def test_allowed_email_like_strings_pass(addr):
    assert kinds(addr) == []


def test_mac_address_fails_doc_block_passes():
    assert kinds("gw " + "-".join(["0e", "3f", "90", "d3", "c6", "a4"])) == ["mac-address"]
    assert kinds("doc " + ":".join(["00", "00", "5e", "00", "53", "01"])) == []


# --- allowlist --------------------------------------------------------------

@pytest.mark.parametrize("addr", [
    dot(192, 0, 2, 10), dot(198, 51, 100, 7), dot(203, 0, 113, 254),
    "2001:db8::1", "127.0.0.1", dot(127, 1, 2, 3), "::1", "0.0.0.0", "[::]",
    "localhost:8080", "127.0.0.1:8081",
])
def test_allowlist_passes(addr):
    assert kinds(f"bind {addr}") == []


def test_doc_range_neighbours_fail():
    assert kinds(dot(192, 0, 3, 1)) == ["non-doc-ipv4"]
    assert kinds(dot(198, 51, 101, 1)) == ["non-doc-ipv4"]


def test_versions_and_non_addresses_pass():
    assert kinds("llama b10665 v1.2.3 build 10.0.19045 time 12:34:56 std::string") == []


# --- fail closed ------------------------------------------------------------

def test_directory_as_input_is_unreadable_and_fails(scratch):
    rc = lp.main([str(scratch)])
    assert rc == 1


def test_missing_input_fails(scratch):
    assert lp.main([str(scratch / "nope.md")]) == 1


@pytest.mark.skipif(hasattr(os, "geteuid") and os.geteuid() == 0, reason="root reads 000 files")
def test_permission_denied_fails(scratch):
    f = scratch / "secret.md"
    f.write_text("clean text\n")
    f.chmod(0)
    assert lp.main([str(f)]) == 1


def test_clean_file_passes_and_dirty_file_fails(scratch):
    clean = scratch / "clean.md"
    clean.write_text(f"serve on 127.0.0.1:8080, example peer {dot(192, 0, 2, 5)}\n")
    dirty = scratch / "dirty.md"
    dirty.write_text(f"peer {dot(192, 168, 4, 4)}\n")
    assert lp.main([str(clean)]) == 0
    assert lp.main([str(clean), str(dirty)]) == 1


def test_file_name_is_scanned(scratch):
    f = scratch / ("pho" + "ne7-setup.sh")
    f.write_text("echo ok\n")
    assert lp.main([str(f)]) == 1


def test_repo_mode_skips_only_override_and_git(scratch):
    repo = scratch / "repo"
    (repo / "config").mkdir(parents=True)
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    (repo / ".gitignore").write_text("local.env\n")
    (repo / "config" / "local.env").write_text(f"HOST={dot(10, 9, 8, 7)}\n")
    (repo / "README.md").write_text("loopback only: 127.0.0.1\n")
    assert lp.main(["--root", str(repo)]) == 0
    assert lp.main(["--root", str(repo), "--all"]) == 0
    (repo / "notes.md").write_text(f"lan {dot(10, 9, 8, 7)}\n")  # untracked, not ignored
    assert lp.main(["--root", str(repo)]) == 1


def test_binary_file_printable_runs_scanned(scratch):
    f = scratch / "shot.png"
    f.write_bytes(b"\x89PNG\x00\x00" + f"tEXt path=/home/{'mallory'}/x".encode() + b"\x00~ab/\x00")
    findings = lp.scan_file(f)
    assert [x.kind for x in findings] == ["home-path"]


def test_cli_exit_code_on_this_repo():
    # The published tree itself must be clean.
    r = subprocess.run([sys.executable, str(SCRIPT)], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr

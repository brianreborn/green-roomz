# Netmgmt kit — compression policy (locked 2026-09-12)

## Goal
Ship a large knowledge + tools kit without burdening day-1 use. Operator: engage **FS/volume compression dynamically and intelligently**; **viewing docs must not require opening an archive**.

## Split

| Class | How it lives on disk | User experience |
|-------|----------------------|-----------------|
| **Docs** (LISA, RFCs, FX4100, vendor manuals, HA/IoT primers, POTS/DSL notes) | Real files on a **transparently compressed volume** (btrfs zstd, squashfs mounted at `/opt/netmgmt-kit`, or zfs compression) | `less` / PDF viewer / browser — **no** `tar` / `kit unpack` |
| **Indexes / search** | Plain `INDEX.md`, `rg` over mounted tree | Instant |
| **Heavy runtimes** (Home Assistant venv, Zeek/Suricata debs cache, golang toolchain, GNS3 bits) | Optional `packed/*.tar.zst` or secondary squashfs | `kit unpack <name>` only when needed |
| **Tier 0/1 apt packages** | Installed into golden snap (already compressed by fs) | Normal `$PATH` |

## Preferred layout

```text
/opt/netmgmt-kit/          ← mount point of compressed volume (squashfs or btrfs subvol)
  docs/                    ← always visible files (never tar-wrapped for reading)
  bin/kit                  ← list layers; unpack runtimes only
  packed/                  ← heavy runtimes only (not docs)
  INDEX.md
```

VirtualBox: second VDI or shared folder that is itself a squashfs/`*.qcow2` with compression, or host folder with NTFS/btrfs compression — guest mounts it so paths stay stable across snaps.

## Do / don't

- **Do** compress underneath (volume/fs).
- **Do** keep FX4100 + LISA + IoT docs as browseable paths from golden snap.
- **Don't** force `tar xf … && less` for manuals.
- **Don't** put docs-only content exclusively inside `packed/*.tar.zst`.
- **Don't** overburden simple tasks (open a PDF, grep a RFC).

## Kit helper behavior

```text
kit docs          # prints docs root; never unpacks
kit search TERM   # rg over docs/
kit unpack NAME   # runtimes only; refuses if NAME is a docs layer
```

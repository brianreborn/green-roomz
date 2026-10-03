# OPNsense install media + kit disk — 2026-09-12

> **Update 2026-09-12:** **Distribution:** dual-track — **(A)** self-serve official OPNsense ISO/VM + kit disk (fetch scripts; we do not host the official ISO blob); **(B)** we also **build** a full offline OVA/export (`grz-netmgmt-offline`) for air-gap/turnkey. See `NETMGMT-DISTRO-TRACKS-2026-09-12.md`. Kit remains a separate attach at `/opt/netmgmt-kit`.


**Audience:** operator Brian (qodesh)  
**Locked distro model:** official OPNsense install ISO **+** separately built kit virtual disk and/or local kit DVD/ISO. **Do not** redistribute a full pre-built OPNsense VM.  
**Self-serve:** scripts + official mirror URLs + SHA256. We do **not** host giant blobs (OPNsense ISO / package layers). Users and local caches pull them.  
**Companions:** `NETMGMT-OUT-OF-BOX-KIT-2026-09-12.md` · `NETMGMT-VBOX-SNAPSHOT-PLAN-2026-09-12.md` · `knowledge/netmgmt/install-media/` · `knowledge/netmgmt/kit-disk/`  
**Nexus/model-pack iterate lane (separate, do not expand here):** `NEXUS-MODEL-ITER-LANE-2026-09-12.md`.

---

## TLDR

| Item | Value |
|------|--------|
| **OPNsense** | **26.7** “Xenial Xenops” (released 2026-07-15) · current series **26.7.3** (image is still the 26.7 install ISO; update in-guest) |
| **Image** | amd64 **dvd** — `OPNsense-26.7-dvd-amd64.iso.bz2` (~471 MiB compressed) |
| **SHA256** | `95cafedda6d5b22ce832e249dc2309110fbee19f813ad78cf28bb3d387186bfb` |
| **Default URL** | `https://pkg.opnsense.org/releases/26.7/OPNsense-26.7-dvd-amd64.iso.bz2` |
| **Fetch (qodesh)** | `knowledge/netmgmt/install-media/fetch-opnsense-iso.ps1 -OutDir <USB-or-large>` |
| **Fetch (box/unix)** | `fetch-opnsense-iso.sh -OutDir DIR [-Mirror URL]` |
| **Kit** | `grz-netmgmt-kit.iso` **170 MiB** (docs-focused, SHA256 `e00d5a5e…c5d9e3`) · optional kit VDI · mount **`/opt/netmgmt-kit`** |
| **qodesh disk** | VBox **7.2.16** installed · **C: ~9.1 GB free** (tight; LocalAI on C:) · only C: visible last check → **fetch-to-USB / large volume** |
| **NICs day-0** | **NAT default** · **Bridged off** · snapshot-first |
| **Hosted on this tree** | scripts + catalog + checksums/pubkey · **not** the 471 MiB ISO |

---

## 1. Official ISO (resolved 2026-09-12)

Sources (cross-checked):

- Download picker: https://opnsense.org/download/
- Release notes + checksums: https://docs.opnsense.org/releases/CE_26.7.html
- Mirror README: https://pkg.opnsense.org/releases/mirror/README — latest stable image **26.7** (July 15, 2026)
- Canonical checksums file: https://pkg.opnsense.org/releases/mirror/OPNsense-26.7-checksums-amd64.sha256
- Forum announce (same SHA256): https://forum.opnsense.org/index.php?topic=52375.0
- Install guide (signature verify): https://docs.opnsense.org/manual/install.html

### Pins

| Field | Value |
|-------|--------|
| Version | **26.7** (dvd / amd64) |
| Filename | `OPNsense-26.7-dvd-amd64.iso.bz2` |
| Uncompressed | `OPNsense-26.7-dvd-amd64.iso` (attach **this** in VirtualBox, not the `.bz2`) |
| SHA256 | `95cafedda6d5b22ce832e249dc2309110fbee19f813ad78cf28bb3d387186bfb` |
| Size | **471 MiB** compressed (mirror listing) |
| Checksums file | `OPNsense-26.7-checksums-amd64.sha256` |
| Series pubkey | `OPNsense-26.7.pub` (also printed on the 26.7 docs page) |

Box-local note: a copy was pulled on 2026-09-12 to verify the pin (`sha256sum` **matched**). Per self-serve policy that blob is **not** kept in the tree for redistribution. Re-fetch with the script onto USB / a large volume.

### Mirrors (`-Mirror` override)

Base URL only (script appends the filename):

| Role | URL |
|------|-----|
| Default / pkg | `https://pkg.opnsense.org/releases/26.7` |
| Same files (mirror alias) | `https://pkg.opnsense.org/releases/mirror` |
| Europe | `https://opnsense.c0urier.net/releases/26.7` |
| US East | `https://mirror.wdc1.us.leaseweb.net/opnsense/releases/26.7` |
| US West | `https://mirror.sfo12.us.leaseweb.net/opnsense/releases/26.7` |
| South America | `http://mirror.ueb.edu.ec/opnsense/releases/26.7` |
| East Asia | `https://mirror.ntct.edu.tw/opnsense/releases/26.7` |
| Full picker | https://opnsense.org/download/ |

Example:

```powershell
# qodesh — do NOT land this on C: if you can avoid it
.\fetch-opnsense-iso.ps1 -OutDir E:\VBox\ISOs
.\fetch-opnsense-iso.ps1 -OutDir D:\ISOs -Mirror https://mirror.wdc1.us.leaseweb.net/opnsense/releases/26.7
```

```bash
./fetch-opnsense-iso.sh -OutDir /media/usb/ISOs -Mirror https://opnsense.c0urier.net/releases/26.7
```

OPNsense notes that checksum files *on a particular mirror* may not prove authenticity — compare to the forum announce / docs page (this board copies that official SHA256). Optional: verify `.sig` against `OPNsense-26.7.pub` per the install guide.

---

## 2. VirtualBox attach recipe (qodesh, VBox 7.2.16)

**Machine Folder + VDIs + ISOs on USB / large volume** — C: ~9.1 GB with LocalAI already there is not enough for VDI + ISO + snaps.

### Disks / optical

| Slot | Media | Role |
|------|--------|------|
| SATA 0 | **Empty system VDI** (dynamic, 20–32 GB) | OPNsense install target — **we do not ship this pre-built** |
| IDE/SATA optical 1 | **Official** `OPNsense-26.7-dvd-amd64.iso` (after bunzip2) | Installer / live |
| IDE/SATA optical 2 **or** SATA 1 | **`grz-netmgmt-kit.iso`** and/or **kit VDI** | Docs + scripts → `/opt/netmgmt-kit` |

No third-party “OPNsense appliance OVA”. Operator installs from the official DVD every time.

### NICs (this media track)

| Adapter | Mode | Day-0 |
|---------|------|--------|
| NIC1 | **NAT** | **Default on** — install / firmware window only |
| NIC2+ | Internal / Host-only | Optional; see snapshot plan for lab fabric |
| **Bridged** | real LAN / ISP | **OFF** until operator go-ahead + `pre-bridged-*` snap |

After `fresh`: disable NAT when not fetching; move admin to Host-only per `NETMGMT-VBOX-SNAPSHOT-PLAN-2026-09-12.md`. Still **no WAN punch** until Green-Roomz allowlist+key UAT.

### Snapshot-first

1. Create VM, attach media, **do not** experiment yet.  
2. Power on → install to empty VDI → first boot OK → snap **`fresh`**.  
3. Harden (default-deny, admin from lab CIDR only, Bridged still off) → snap **`golden-netmgmt`**.  
4. Named `exp-*` snaps before plugins / peer-CIDR trials.  
5. `pre-bridged-YYYYMMDD` before any Bridged attach.

### Kit mount (`/opt/netmgmt-kit`)

```text
# OPNsense / FreeBSD — kit ISO as second optical
mkdir -p /mnt/kit /opt/netmgmt-kit
mount -t cd9660 /dev/cd1 /mnt/kit          # device name may be cd0/cd1
cp -a /mnt/kit/. /opt/netmgmt-kit/
# or keep mounted read-only and symlink:
# ln -s /mnt/kit /opt/netmgmt-kit

# kit VDI (writable): mount the filesystem at /opt/netmgmt-kit directly
# helper: /opt/netmgmt-kit/bin/kit list | unpack | mount-hint | core-ready
```

Shared-folder / virtiofs from a host copy of `knowledge/netmgmt*` is an alternative if the ISO is not used.

---

## 3. Scripts (self-serve)

| Script | Purpose |
|--------|---------|
| `knowledge/netmgmt/install-media/fetch-opnsense-iso.ps1` | qodesh: `-OutDir` (required), `-Mirror`, SHA256, bunzip2 |
| `knowledge/netmgmt/install-media/fetch-opnsense-iso.sh` | same on box/unix |
| `knowledge/netmgmt/install-media/fetch-kit-layers.ps1` | official mitmproxy + tcpdump/libpcap src · `-OutDir` `-Mirror` `-Layer` |
| `knowledge/netmgmt/install-media/fetch-kit-layers.sh` | same |
| `knowledge/netmgmt/install-media/catalog.json` | pinned URLs + SHA256 |
| `knowledge/netmgmt/kit-disk/build-kit-iso.sh` | docs kit ISO from `netmgmt-docs.tar.zst` |

qodesh C: warning is baked into the `.ps1` files when `-OutDir` starts with `C:\`.

---

## 4. Kit ISO / VDI (separately built)

Docs-focused **first** (from `netmgmt-docs.tar.zst` extract). Packages = second ISO/layer.

| Artifact | Notes |
|----------|--------|
| Source archive | `/workspace/knowledge/netmgmt-docs.tar.zst` · 130 MiB · SHA256 `4565c5e086c173153b1cf9b8919769279a8d17372b243f3117c5c18e69678689` |
| Build | **done** — `knowledge/netmgmt/kit-disk/grz-netmgmt-kit.iso` · **170 MiB** · SHA256 `e00d5a5e5899b2d3d49fc130f4d83881316f18f8865afcbf5a343456e1c5d9e3` |
| Optional VDI | `VBoxManage createmedium disk … --size 2048` on a **large** volume; copy ISO contents (see `kit-disk/BUILD-KIT-DISK.md`) |
| Packages layer | `fetch-kit-layers.*` + `scripts/fetch-pcap-debs.sh` — **not** folded into the docs ISO |

---

## 5. qodesh host facts (this pass)

| Fact | Value |
|------|--------|
| Hypervisor | VirtualBox **7.2.16** **installed** |
| C: free | **~9.1 GB** (tight) |
| LocalAI | on **C:** |
| Other volumes | **only C: visible** in last check — discover USB / extra volume before create-VM |
| Implication | Fetch ISO + place Machine Folder **off C:** (USB/large). Do not invent a drive letter. |

---

## 6. What we will not ship

- Full pre-built OPNsense VDI/OVA/VM  
- Official ISO inside git / kit ISO  
- Bridged-on golden images  
- Kali live ISO as the netmgmt guest  

---

## Document control

| Field | Value |
|-------|--------|
| Path | `/workspace/reviews/release/NETMGMT-OPNSENSE-INSTALL-MEDIA-2026-09-12.md` |
| Date | 2026-09-12 |
| OPNsense pin | 26.7 dvd amd64 · SHA256 `95cafedda6d5b22c…86186bfb` |
| Distro | official ISO (self-serve) + kit ISO/VDI |
| Guest kit path | `/opt/netmgmt-kit` |

## 7. Download status (this box)

| Item | Status |
|------|--------|
| Official OPNsense 26.7 dvd bz2 | **Not kept** — self-serve. Pin verified on 2026-09-12 then removed so we do not host the blob. Re-fetch with `fetch-opnsense-iso.* -OutDir <USB-or-large>`. |
| Kit docs ISO | **Built** — 170 MiB at `knowledge/netmgmt/kit-disk/grz-netmgmt-kit.iso` |
| qodesh C: | ~9.1 GB free / LocalAI on C: / only C: visible — **do not** fetch official ISO onto C: |

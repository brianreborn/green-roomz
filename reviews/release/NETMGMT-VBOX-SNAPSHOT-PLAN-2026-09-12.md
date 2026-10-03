# Netmgmt VirtualBox snapshot plan — 2026-09-12

**Audience:** operator Brian  
**Priority:** ASAP stand-up of a **secured netmgmt VM** on VirtualBox (snapshot-first), aligned with private LAN board + Green-Roomz `allow_peers` / tunnel **design** — **no WAN punch until allowlist+key UAT**.  
**Hard rules:** defensive only · no exploits/PoCs · no plaintext creds · do **not** invent hardware ownership · no `git push` unless asked · Note9 phone (Termux) stays separate; Note9 **VM** is another VirtualBox cell later.

**Companions:**
- `/workspace/reviews/release/FLEET-PRIVATE-LAN-NETWORK-OPTIONS-2026-09-12.md`
- `/workspace/reviews/release/GOAL-UPDATE-3OS-NOTE9VM-2026-09-12.md`
- `/workspace/reviews/release/OFFLINE-SECURITY-WORKSTATION-PLAN-2026-09-12.md`
- `/workspace/reviews/release/NETMGMT-OPNSENSE-INSTALL-MEDIA-2026-09-12.md`

---

## TLDR

| Item | Decision |
|------|----------|
| **Hypervisor** | **VirtualBox only** (works most places) |
| **Host candidate** | **qodesh** (Windows) — VBox **7.2.16 installed** |
| **Install source** | `winget` → `Oracle.VirtualBox` **7.2.16** |
| **Disk placement** | **C: ~9.1 GB free (tight; LocalAI on C:).** Only C: visible last check. Fetch ISO + Machine Folder to **USB / large volume** |
| **Goal VM** | Secured **netmgmt** lab: firewall / router / DNS / peer allowlist |
| **Snapshot-first** | After install → `fresh` · after harden → `golden-netmgmt` · before experiments → named snaps |
| **Recommended guest** | **OPNsense** (netmgmt appliance) — or **Debian hardened jump + WireGuard** if Roomz+tools must live in the same VM |
| **WAN** | **No** punch / no world bind until Green-Roomz allowlist+key UAT |
| **Note9** | Phone = Termux SSH client (separate). Note9 VM = later VBox cell |

---

## 1. Host facts (qodesh)

| Fact | Value | Implication |
|------|-------|-------------|
| Host | **qodesh** (Windows) — build / dogfood / USB hub | Candidate hypervisor host for this cell |
| VirtualBox | **7.2.16 installed** (operator fact) | Confirm `VBoxManage --version` on qodesh; this Linux box has no VBoxManage |
| Package | `Oracle.VirtualBox` **7.2.16** (winget) | Prefer winget over random ISO download |
| C: free space | **~9.1 GB** (LocalAI on C:) | Still **too small** for VDI + official ISO + snaps — **do not** default Machine Folder to `C:` |
| Larger volume | **Only C: visible** last check — discover USB / extra volume | Operator must pick a volume with **≥40–80 GB free**; fetch-to-USB OK |
| Ownership | Do **not** invent that Brian owns a specific drive letter or enclosure | Inventory first; record chosen path in a dated note |

**Pre-flight (operator on qodesh):**

```powershell
# Space inventory — run before install/create
Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{N='FreeGB';E={[math]::Round($_.Free/1GB,1)}}, @{N='UsedGB';E={[math]::Round($_.Used/1GB,1)}}
# Optional: if LocalAI or similar path exists, measure it explicitly (path as observed — do not invent)
# Get-ChildItem D:\, E:\ -ErrorAction SilentlyContinue | Select-Object FullName
```

**Rule:** Machine Folder + default disk location + ISO cache all land on the **chosen large volume**, never on the ~2.3 GB C: free pool.

---

## 2. Install steps (VirtualBox via winget)

Run elevated PowerShell on **qodesh** when ready:

```powershell
# 1) Confirm package
winget search Oracle.VirtualBox

# 2) Install (pin/version as available; board cites 7.2.16)
winget install --id Oracle.VirtualBox -e --accept-package-agreements --accept-source-agreements

# 3) Verify
& "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" --version

# 4) Set default Machine Folder to LARGE volume (example path — REPLACE after discover)
# VBoxManage setproperty machinefolder "D:\VMs"   # or E:\VMs / <LocalAI>\VMs / external
```

**Also:**

1. Install **VirtualBox Extension Pack** matching the exact VBox version (USB 2/3, etc.) from Oracle’s matching release — only if needed for this cell (netmgmt lab usually does **not** need USB passthrough on day one).
2. Reboot if the installer requests it (host-only / bridged NDIS drivers).
3. Confirm Hyper-V / Windows features conflict: if Hyper-V is on and VBox fails to start VMs, resolve **before** spending time on guest install (operator choice — do not force disable without checking other workloads on qodesh).
4. Create directories on the large volume, e.g. `<LARGE>\VBox\Machines`, `<LARGE>\VBox\ISOs`, `<LARGE>\VBox\Export`.

---

## 3. Recommended guest OS

### Recommendation (primary)

**OPNsense** — prefer for a dedicated **netmgmt appliance** (firewall / router / DNS / allowlist lab). Matches private-LAN Option A edge class in `FLEET-PRIVATE-LAN-NETWORK-OPTIONS-2026-09-12.md`.

| Guest | When to pick | Role fit |
|-------|--------------|----------|
| **OPNsense** (**recommend**) | Want native firewall/router/DNS/VPN UI; snapshot-able golden netmgmt cell | Best match for “secured netmgmt VM” ASAP |
| **pfSense** | Operator preference / existing muscle memory | Same appliance class as OPNsense |
| **Debian hardened + WireGuard** | Want Roomz tip / tools / jump-host **in the same VM** as WG | Better if “netmgmt” = jump+tunnel design sandbox, not full edge appliance |
| **Dual later** | Appliance VM **plus** Debian jump | Possible after `golden-netmgmt` exists — do not block ASAP on dual |

**Do not** conflate this cell with:

- Offline **workstation image** matrix (3 OS × host+Note9 VM) — separate ship track  
- **Note9 phone** Termux client — USB+adb from qodesh  
- **Note9 VM** ship cell — **later** VirtualBox guest, not this netmgmt VM  

---

## 4. VM sizing (starting point)

Conservative lab sizes — adjust after operator measures host RAM/CPU; **do not invent** that qodesh has a specific RAM amount.

| Resource | OPNsense / pfSense | Debian jump + WG | Notes |
|----------|--------------------|------------------|-------|
| **vCPU** | 2 | 2 | Bump to 4 only if host has clear headroom |
| **RAM** | 2–4 GB | 2–4 GB | Start 2 GB; 4 GB if Suricata/plugins or heavy DNS |
| **Disk (VDI)** | 20–32 GB dynamic | 20–40 GB dynamic | On **large volume**; leave headroom for snapshots |
| **Snapshot budget** | Plan **+2×** base VDI free on same volume | Same | Snaps grow; keep ≥40–80 GB free on VM volume |
| **ISO** | Official OPNsense amd64 DVD/VGA ISO | Official Debian netinst/live | Store under `<LARGE>\VBox\ISOs` |
| **NIC count** | **2+** (WAN-facing *lab* + LAN) | 1–2 | See §5 — “WAN” here means VBox network, not internet punch |

**Name suggestion:** `netmgmt-opnsense` (or `netmgmt-debian-wg` if that path).

---

## 5. Network modes (private LAN lab first)

Align with private LAN board + Green-Roomz: **default-deny**, peer allowlist **design**, **no WAN punch until UAT**.

| Adapter | Mode | Purpose | When |
|---------|------|---------|------|
| **NIC1** | **NAT** (default) | Install/update window; controlled fetch | Day 0 default; disable or swap after `golden-netmgmt` |
| **NIC2** | **Internal** `netmgmt-lab` | Isolated private LAN lab fabric | Day 0 |
| **NIC3 (optional)** | **Host-only** | qodesh ↔ admin UI/SSH | Optional (`-EnableHostOnly`); recommended once admin path needed |
| **Bridged** | Real LAN / ISP path | **OFF by default** — only when ready / post-UAT | **Not** for ASAP; no world bind |

**Rules:**

1. **ASAP topology:** Host-only + Internal only. Treat Internal as the private LAN stand-in for firewall/DNS/allowlist drills.  
2. **Bridged:** enable only when operator explicitly wants the VM on the real segment — still **no** Green-Roomz WAN listen / tunnel punch until allowlist+key UAT.  
3. **Green-Roomz:** `allow_peers` + tunnel design stay **design docs / configs on disk**; loopback or host-only peers until UAT.  
4. **Note9 phone:** stays USB+adb client path — do not require Wi-Fi peer into this VM for first bring-up.

**VBoxManage sketch (paths/names illustrative):**

```text
# After VBox installed and Machine Folder on large volume:
# 1) Create Host-Only network (GUI: File → Host Network Manager) — note adapter name
# 2) Create Internal network name e.g. "netmgmt-lab"
# 3) VM NICs: NIC1 hostonly, NIC2 intnet "netmgmt-lab"
# 4) Leave Bridged disconnected until operator go-ahead
```

---

## 6. Snapshot schedule (mandatory)

**Snapshot-first** — take snaps **before** any irreversible experiment.

| Trigger | Snapshot name | Contents / intent |
|---------|---------------|-------------------|
| Guest OS installed + first boot OK; basic NIC up | **`fresh`** | Clean install baseline; no harden yet |
| Firewall default-deny, DNS stub, admin locked down, no WAN punch | **`golden-netmgmt`** | Restore point for “secured netmgmt” lab |
| Before each experiment / plugin / peer-CIDR trial | **`exp-<topic>-YYYYMMDD`** | Named; delete after merge-back or keep short chain |
| Before Bridged attach or any real-LAN test | **`pre-bridged-YYYYMMDD`** | Explicit gate before leaving Internal/Host-only |
| Before Extension Pack / major VBox host upgrade | Host-side export/OVA optional | Prefer **File → Export Appliance** of `golden-netmgmt` to large volume |

**Hygiene:**

- Prefer **linear** snap chains early; avoid deep branching until comfortable restoring.  
- After restore to `golden-netmgmt`, re-verify NIC modes (Host-only + Internal) before experiments.  
- Export `golden-netmgmt` OVA to `<LARGE>\VBox\Export\` when stable.

---

## 7. Harden path (to reach `golden-netmgmt`)

High-level only — defensive appliance posture:

1. Install from official ISO on host-only/internal NICs.  
2. Set strong admin credentials (operator-held; **no plaintext in this repo**).  
3. Default-deny LAN/WAN rules; allow admin only from host-only CIDR.  
4. DNS: local resolver for lab names only; no open recursion to world.  
5. Document intended Green-Roomz peer CIDR / `allow_peers` **design** (no live WAN tunnel).  
6. Disable unused services; apply OPNsense/pfSense updates **during a NAT window**, then disable NAT again.  
7. Take **`golden-netmgmt`**.  
8. Only then: named experimental snaps for VLAN drills, peer allowlist dry-runs, WireGuard **listener design** (still no punch until UAT).

If **Debian** path: CIS-ish baseline, ufw/nft default-deny, WireGuard keys generated offline, Roomz tip bound to loopback/host-only until UAT.

---

## 8. Ten immediate tasks

| # | Task | Done when |
|---|------|-----------|
| 1 | Inventory free space on `D:` / `E:` / LocalAI / external — pick **Machine Folder** volume (≥40–80 GB free) | Path written down; C: **not** used for VDIs |
| 2 | `winget install --id Oracle.VirtualBox -e` (7.2.16 class) + verify `VBoxManage --version` | VBox runs on qodesh |
| 3 | Set Machine Folder + ISO dir on large volume | New VM defaults off C: |
| 4 | Create Host-only network + Internal net `netmgmt-lab` | Both visible in VBox Network settings |
| 5 | Download official **OPNsense 26.7** dvd-amd64 ISO (`fetch-opnsense-iso.ps1`) + verify SHA256 | ISO checksum verified; kit VDI/ISO separate |
| 6 | Create VM via `create-netmgmt-vbox.ps1`: empty sys VDI + official ISO + kit; NAT default; bridged off | VM powers on to official installer |
| 7 | Complete install → first boot → admin reachable via host-only | Take snapshot **`fresh`** |
| 8 | Harden: default-deny, admin from host-only only, DNS lab-only, no Bridged, no WAN punch | Take snapshot **`golden-netmgmt`** |
| 9 | Align notes with private LAN board + Green-Roomz `allow_peers` / tunnel **design** (peer CIDR draft only) | Design note path recorded; still no UAT punch |
| 10 | Export OVA of `golden-netmgmt` to `<LARGE>\VBox\Export\` + list next experiments as named snaps only | Backup artifact exists; Bridged deferred |

---

## 9. Out of scope / later cells

| Item | Status |
|------|--------|
| Note9 **phone** Termux SSH | Separate client track (USB+adb) |
| Note9 **VM** VirtualBox cell | **Later** — not this netmgmt VM |
| Bridged to house LAN / ISP | Only when ready; still no WAN punch until UAT |
| Dual OPNsense + Debian jump | After `golden-netmgmt` exists |
| Physical OPNsense appliance buy | Gear **class** only — do not invent ownership (see private LAN board) |
| Dispatch P0 freeze / image matrix ship | Orthogonal tracks — do not block each other wrongly |

---

## 10. Document control

| Field | Value |
|-------|-------|
| Path | `/workspace/reviews/release/NETMGMT-VBOX-SNAPSHOT-PLAN-2026-09-12.md` |
| Date | 2026-09-12 |
| Hypervisor | VirtualBox (mandatory) |
| Host candidate | qodesh (Windows); VBox **7.2.16 installed**; C: ~9.1 GB / LocalAI on C: / only C: visible last check |
| Disk constraint | C: ~9.1 GB free — VMs/ISOs on USB or discovered larger volume; fetch scripts warn on `C:\` |
| **Recommended guest** | **OPNsense** (netmgmt appliance); Debian+WG if Roomz+tools in-same-VM |
| Snapshot anchors | `fresh` → `golden-netmgmt` → named `exp-*` |
| WAN policy | No punch until Green-Roomz allowlist+key UAT |

## Space update (2026-09-12 AFK — Release Driver watch)

Researcher room note: **C: ~9 GB free after cleanup** (was ~2.3 GB in the plan table). Still **too small** for VDI+snaps — Machine Folder stays **off C:**. Discover larger volume before create-VM. No invent of drive ownership.

## Kit scope expand (2026-09-12 — New Bot / operator)

**Out-of-box netmgmt kit** (BOM+fetch under `/workspace/knowledge/netmgmt/`): LISA + conference netadmin knowledge, common business/home gear manuals, full pre-downloaded packet-analysis packages — for common nets + FX4100/fleet LAN.

**Golden snap inclusion:** when VBox UAC clears on qodesh, mount kit via **shared folder or ISO** into `golden-netmgmt` (or successor). Release Driver watches; does **not** rewrite `routing.mjs` / gateway (PR #12 mutex).

## Distro model lock (2026-09-12 — operator via New Bot)

**BOTH tracks** (see `NETMGMT-DISTRO-TRACKS-2026-09-12.md`):

- **Track A:** self-serve official OPNsense ISO/VM + our kit disk/DVD  
- **Track B:** we **build** full offline VM image artifact (`grz-netmgmt-offline.ova`/export) alongside official OPNsense VM path  

Golden snap `fresh`→`golden-netmgmt` feeds Track B export. Release Driver watches; `routing.mjs` mutex unchanged.

## 11. Distribution model — official ISO + kit disk (LOCKED 2026-09-12)

**Intent lock:** operators install OPNsense from **official** media; we supply a **separate** kit disk/ISO. We do **not** ship a full pre-built OPNsense appliance/OVA.

### Media

| Item | Detail |
|------|--------|
| Official pin | **OPNsense 26.7** `OPNsense-26.7-dvd-amd64.iso.bz2` (~471M) |
| SHA256 | `95cafedda6d5b22ce832e249dc2309110fbee19f813ad78cf28bb3d387186bfb` |
| Chooser | https://opnsense.org/download/ |
| Docs + checksums | https://docs.opnsense.org/releases/CE_26.7.html |
| Canonical files | https://pkg.opnsense.org/releases/26.7/ |
| Full write-up | `NETMGMT-OPNSENSE-INSTALL-MEDIA-2026-09-12.md` |
| qodesh fetch | `knowledge/netmgmt/install-media/fetch-opnsense-iso.ps1 -OutDir <USB-or-large> [-Mirror URL]` (also `scripts/fetch-opnsense-iso.ps1 -Dest/-OutDir`) |

### Create-VM recipe (summary)

1. Empty **system** VDI (20–32 GB) on large volume — OPNsense installs here.  
2. Attach **official** OPNsense DVD ISO (optical).  
3. Attach **`grz-netmgmt-kit.vdi`** (SATA HDD) and/or **`grz-netmgmt-kit.iso`** (second optical).  
4. **NIC1 NAT** default (install/update window only).  
5. **Host-only** optional (`-EnableHostOnly`); **Internal** `netmgmt-lab` for private LAN drills.  
6. **Bridged off-by-default** — enable only with explicit operator go-ahead; still no WAN punch until Green-Roomz UAT.  
7. Install OPNsense → first boot → snapshot **`fresh`**.  
8. Mount/copy kit → `/opt/netmgmt-kit` → harden → snapshot **`golden-netmgmt`**.  
9. Disable NAT after golden if desired; keep bridged off.

Script: `knowledge/netmgmt/scripts/create-netmgmt-vbox.ps1`  
Kit design: `knowledge/netmgmt/kit-disk/README.md`

### Snapshot-first (unchanged anchors)

`fresh` (post-install) → harden + kit → `golden-netmgmt` → named `exp-*`. Never experiment without a snap.

## Media + qodesh probe (2026-09-12 Release Driver)

| Item | Status |
|------|--------|
| OPNsense 26.7 ISO | **self-serve** — scripts + SHA256 in `install-media/`; official blob **not** kept in tree |
| Kit ISO | `/workspace/knowledge/netmgmt/kit-disk/grz-netmgmt-kit.iso` |
| `create-netmgmt-vbox.ps1` | `/workspace/knowledge/netmgmt/scripts/create-netmgmt-vbox.ps1` |
| Track B | **still wanted** (dual-track) — kit-separate = Track A |
| qodesh C: free | **9.1 GB** (2026-09-12 probe) — still **too small**; no other FileSystem PSDrive seen |
| VBoxManage | **present** `C:\Program Files\Oracle\VirtualBox\VBoxManage.exe` **7.2.16** — use full path (not on PATH) |

**Gate before `create-netmgmt-vbox.ps1`:** discover volume ≥40–80 GB free (USB/external) + decompress ISO + pass `-MachineFolder` / `-OpnsenseIso` / `-KitIso`. VBox **already** installed — call full-path VBoxManage.

**Self-serve (Track A):** official OPNsense ISO and kit layers are pulled by the operator (`-OutDir`, `-Mirror`). We do not host those giant blobs. Track B offline OVA (if built later) is a separate artifact — this media track does not redistribute a pre-built OPNsense VM.

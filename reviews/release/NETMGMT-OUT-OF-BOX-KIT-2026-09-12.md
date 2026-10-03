# Netmgmt out-of-box kit — BOM + compact mount plan — 2026-09-12

> **Update 2026-09-12:** **Distribution:** dual-track — **(A)** self-serve official OPNsense ISO/VM + kit disk (fetch scripts; we do not host the official ISO blob); **(B)** we also **build** a full offline OVA/export (`grz-netmgmt-offline`) for air-gap/turnkey. See `NETMGMT-DISTRO-TRACKS-2026-09-12.md`. Kit remains a separate attach at `/opt/netmgmt-kit`.


**Audience:** operator Brian  
**Companions:** `NETMGMT-VBOX-SNAPSHOT-PLAN-2026-09-12.md` · `NETMGMT-OPNSENSE-INSTALL-MEDIA-2026-09-12.md` · `FLEET-PRIVATE-LAN-NETWORK-OPTIONS-2026-09-12.md` · `/workspace/knowledge/lisa-seed/SEEDS.md` · `/workspace/knowledge/fx4100/` · `/workspace/knowledge/FETCH-POLICY.md` · `/workspace/knowledge/netmgmt/MANIFEST.md`  
**Hard rules:** defensive / admin only · no exploits/PoCs · official/free allowlist only · no pirate books · do **not** invent gear ownership beyond **FX4100** + known fleet (**qodesh / shalom / note9 / pixel8**) · no full Kali ISO as guest · no `git push`.

---

## TLDR

| Item | Decision |
|------|----------|
| **Guest** | OPNsense **or** Debian hardened jump — kit mounts into either |
| **Mount path** | **`/opt/netmgmt-kit`** (shared folder / ISO / virtiofs) |
| **Layout** | Always-ready core unpacked · large layers as **`*.tar.zst`** (or squashfs/btrfs) · **`bin/kit`** unpack-on-demand |
| **Core always-ready** | Docs seed + RFCs + FX4100 + **mitmproxy** + vim/editors + tcpdump/tshark + basic net tools |
| **On-demand layers** | Full Wireshark GUI / Zeek / Suricata · GNS3 / containerlab / mininet · Kali-crib .deb cache · vendor PDF bulk |
| **Compression** | Prefer **tar.zst -19** packs; volume/fs options (btrfs compress, zfs, squashfs, virtiofs packed layers) OK when cheaper than per-file juggling |
| **Guest brand** | **Not** “Kali VM” — Debian/OPNsense + compact Kali **package crib** |
| **Kit distribution** | **Separate kit VDI/ISO** — official OPNsense media only; **no** pre-built OPNsense appliance from us |

---

## 1. BOM tiers

### Tier A — Always-on docs (seed, stay small)

| Bundle | Contents | Source | Est. size |
|--------|----------|--------|-----------|
| **A1 LISA seed** | ≤15 USENIX LISA (+ optional SREcon) netadmin papers from `lisa-seed/SEEDS.md` | `www.usenix.org` / legacy | ~5–15 MB PDF |
| **A2 RFCs** | Netops set: 1918, 1912, 2131, 4861, 5905, 1034/1035, 7230/7231, TLS 8446/5246, DNS/DHCP/IPv6/NTP, PPP-adjacent (see Tier E) | `rfc-editor.org` | ~4 MB (fetched) |
| **A3 Gear manuals (public)** | OPNsense HTML/docs zip · pfSense handbook PDF · UniFi QSGs · MikroTik pointers/PDF when free · Cisco/Juniper **public** quick refs only | Vendor allowlist | ~20–80 MB |
| **A4 Operator-specific** | FX4100 pack (symlink/copy from `knowledge/fx4100/`) · private-LAN checklist · fleet host notes (qodesh/shalom/note9/pixel8 — no invented gear) | Existing + boards | ~9 MB (FX4100) |
| **A5 Older access tech** | POTS/DSL/PPP/ATM/ADSL/VDSL **docs** (RFCs + free ITU/Broadband Forum where allowed) | rfc-editor · allowlisted forums | ~2–10 MB |

### Tier B — Packet analysis offline package set

| Class | Packages / artifacts | Always vs on-demand | Notes |
|-------|----------------------|---------------------|-------|
| **B0 mitmproxy** | `mitmproxy` + deps (official binary or deb/pip) | **ALWAYS-READY CORE** | Key operator ask — TLS-aware debug proxy for **own** lab traffic |
| **B1 capture CLI** | `tcpdump`, `tshark`, `ngrep`, `editcap`, `mergecap`, `capinfos`, `reordercap`, `text2pcap` | Core | Debian `.deb` cache for guest suite |
| **B2 Wireshark GUI** | wireshark + Qt deps · Windows PortableApps for **qodesh** host tools | On-demand tar.zst (~100 MB portable) | Pre-download portable; unpack via `kit` |
| **B3 termshark** | termshark binary/deb | Core-ish | TUI over tshark |
| **B4 Zeek / Suricata** | Official packages if size/license OK | On-demand layer | Document version pins; skip if too large for golden snap |
| **B5 Windows host** | Wireshark Portable + Npcap note (operator install) | qodesh shared folder | Not inside OPNsense |

**Debian guest target:** match plan guest — prefer **Debian 13 (trixie)** package names if jump host; OPNsense uses FreeBSD packages separately (document `pkg` list; do not force Linux debs into OPNsense).

### Tier C — Operator-specific (FX4100 + private LAN)

| Item | Path / action |
|------|----------------|
| FX4100 manuals + Inseego/T-Mobile HTML | `/workspace/knowledge/fx4100/` → kit `operator/fx4100/` (or mount sibling) |
| Private LAN checklist | Extract from `FLEET-PRIVATE-LAN-NETWORK-OPTIONS-2026-09-12.md` → `operator/PRIVATE-LAN-CHECKLIST.md` |
| Fleet hosts | qodesh, shalom, note9, pixel8 only — **no invented switches/APs** |
| Green-Roomz | `allow_peers` design note only — no WAN punch |

### Tier D — Network virtualization (inside VM)

| Layer | Role | Pack form |
|-------|------|-----------|
| **VBox host-only + Internal** | Day-0 topology (already in VBox plan) | Config docs only |
| **Mininet** | Lightweight SDN/teaching topologies | On-demand `virt-mininet.tar.zst` |
| **Containerlab** | Container-based lab topologies | On-demand `virt-containerlab.tar.zst` |
| **GNS3** | Heavier appliance lab (docs + install script) | On-demand; **appliance images operator-sourced** |
| **Nested hypervisor** | Full nested VBox/KVM | **Not default** — document only if operator enables nested VT |

Prefer containerlab/mininet over nested hypervisors for space and snap stability.

### Tier E — Older technologies (POTS / DSL / PPP / ATM)

Defensive diagnostics + standards literacy for legacy CPE / ISP handoffs (FX4100 may sit behind or beside legacy gear **classes** — do not invent ownership).

| Docs | Utilities (Debian crib) |
|------|-------------------------|
| RFCs: PPPoE 2516, PPP 1661, LCP/IPCP family pointers, ATM-related as needed | `ppp`, `pppoeconf` (where packaged), `adsl-utils` / `ppp-udeb` if available on suite |
| ITU/Broadband Forum **free** TR summaries where allowlisted | `ping`, `mtr`, `iperf3`, `socat`, `netcat-openbsd` — generic path debug |
| Consumer router admin glossaries (official vendor PDFs only) | Modem/ONT serial console notes — docs only |

### Tier F — Kali crib (compact — NOT Kali ISO guest)

| Crib set | Example packages (Debian names; map from Kali metapackages) |
|----------|--------------------------------------------------------------|
| **Net admin** | nmap, masscan (**own nets only**), netdiscover, arp-scan, traceroute, mtr, whois, dnsutils, bind9-dnsutils, iperf3, socat, netcat-openbsd, ethtool, bridge-utils, vlan, tcpdump, tshark, mitmproxy, termshark |
| **Forensics-lite** | foremost, testdisk, sleuthkit (optional size), hashdeep/md5deep, foremost — **no attack frameworks** |
| **Editors / dev core** | **vim**, vim-nox, neovim (optional), nano, emacs-nox (optional), git, curl, wget, jq, python3, python3-pip, build-essential, strace, lsof, tmux, screen, ripgrep, fd-find |
| **Packaging** | `apt-get download` lists + `packages/debian/*.deb` in compressed cache · script `fetch-pcap-debs.sh` + `fetch-kali-crib-debs.sh` |

Ship **package lists + compressed .deb cache**, never a Kali live ISO as the netmgmt guest.

---

## 2. Compact kit layout (inside guest)

```
/opt/netmgmt-kit/
  README.md
  MANIFEST.md                 # mirrored from knowledge/netmgmt/MANIFEST.md
  bin/kit                     # unpack / list / mount helper
  core/                       # always-ready (small)
    docs/                     # LISA seed, RFCs, FX4100 INDEX, checklists
    bin/                      # mitmproxy symlink or wrapper, termshark, …
    etc/                      # editor defaults hint (vim)
  layers/                     # compressed on-demand
    docs-extra.tar.zst
    wireshark-win-portable.tar.zst
    pcap-debs-debian13.tar.zst
    kali-crib-debs.tar.zst
    virt-mininet.tar.zst
    virt-containerlab.tar.zst
    zeek-suricata.tar.zst     # optional
  packages/                   # optional unpacked cache during NAT window
  mounts/                     # squashfs/virtiofs notes
```

### `bin/kit` commands (stub)

```text
kit list              # show layers + sizes
kit unpack <layer>    # zstd -d | tar -x into /opt/netmgmt-kit/layers/<name>/
kit pack <dir>        # operator rebuild tar.zst
kit mount-hint        # print virtiofs/vbox shared-folder / squashfs options
kit core-ready        # verify mitmproxy + tcpdump + vim + docs present
```

### Compression / volume options

| Method | When |
|--------|------|
| **tar.zst -19 -T0** | Default for layers (cross-OS, simple) |
| **squashfs** | If guest mounts many read-only layers often |
| **btrfs compress=zstd** / **zfs compression** | If VM disk already on those FS — enable at volume level to avoid per-file juggling |
| **virtiofs / VBox shared folder** | Host holds `knowledge/netmgmt*` · guest mounts at `/opt/netmgmt-kit` |

---

## 3. Install into VM steps

### Shared folder (recommended early)

1. On **qodesh**: place `netmgmt-docs.tar.zst` + `netmgmt/packages/` on large volume (not C:).  
2. VBox: Shared Folder → guest mount `/media/sf_netmgmt` or virtiofs → `/opt/netmgmt-kit`.  
3. `kit unpack` only what the session needs; keep golden snap lean.

### ISO / hybrid (kit — not the OPNsense installer)

1. Build docs-focused `grz-netmgmt-kit.iso` from `netmgmt-docs.tar.zst` (`kit-disk/build-kit-iso.sh`). Packages stay a **second** ISO/layer (`fetch-kit-layers.*`).  
2. Attach as **second optical** (or kit VDI) beside the **official** OPNsense DVD + empty system VDI.  
3. Copy/mount to `/opt/netmgmt-kit`; take `golden-netmgmt` snap.  
4. Official OPNsense ISO is operator-fetched — `install-media/fetch-opnsense-iso.ps1 -OutDir <USB-or-large> [-Mirror URL]` — never shipped inside this kit.

### OPNsense vs Debian

| Guest | Docs | Linux .debs | BSD pkgs |
|-------|------|-------------|----------|
| **OPNsense** | Mount docs; use `pkg` for tcpdump/wireshark-lite where available | Keep debs for a **sidecar Debian jump** or host tools | Document `pkg install` list separately |
| **Debian jump** | Full kit; `apt-get install` from crib cache (offline `--allow-unauthenticated` only if signed cache policy set) | Primary | N/A |

---

## 4. Size estimates (approx)

| Component | Unpacked | Compressed target |
|-----------|----------|-------------------|
| RFCs + LISA seed + vendor HTML/PDF seed | ~30–100 MB | ~15–40 MB zst |
| FX4100 (existing) | ~9 MB | ~4.7 MB zst already |
| mitmproxy + CLI pcap core debs | ~50–150 MB | ~30–80 MB |
| Wireshark Windows Portable | ~110 MB | ~90–100 MB (already compressed installer) |
| Kali crib deb cache (net+editors+forensics-lite) | ~200–500 MB | ~120–300 MB zst |
| Virt layers (mininet/containerlab) | varies | on-demand only |
| **Golden always-ready inside VM** | aim **≤300–500 MB** unpacked core | rest stays packed |

---

## 5. UTILITIES-CANDIDATES — **APPROVED / LOCKED**

Source board: `NETMGMT-UTILITIES-SUGGESTIONS-2026-09-12.md` (operator APPROVED Tier 0/1).  
Ontology: `NETMGMT-HA-ONTOLOGY-2026-09-12.md` · compression: `NETMGMT-COMPRESSION-POLICY-2026-09-12.md`

| Tier | Status | Contents |
|------|--------|----------|
| **0 always unpacked** | **LOCKED** | vim, **mitmproxy**/mitmdump/mitmweb, tcpdump, tshark, iproute2, bridge-utils, vlan, openssh, curl, jq, git, tmux, rsync, less, ripgrep, FX4100 index + RFC seed |
| **1 golden apt** | **LOCKED** | wireshark, termshark, ngrep, tcpflow, editcap/mergecap, nmap, traceroute, mtr-tiny, iperf3, netcat-openbsd, socat, arp-scan, bind9-dnsutils, wireguard-tools, openvpn, vim/neovim/micro, build-essential, python3-venv/pip, mosquitto + mosquitto-clients + python3-paho-mqtt, minicom/picocom, ppp/pppoe lab |
| **2 packed layers** | on-demand | lisa-netops, vendor-manuals, zeek-suricata, gns3-containerlab, devtools-heavy, legacy-access, **home-automation** |
| **Home automation** | packed + transparent ontology tree | `transport/` (X-10…MQTT) · `wireless/` · `lighting/` (DALI/DMX/Hue… **not** X-10) · `platforms/` · `runbooks/` |
| Parent merge slot | open for extras | Additional utility suggestions may append below |

### Extra candidates (parent may still append)

| Candidate | Tier hint | Notes |
|-----------|-----------|-------|
| heyu (X-10) | packed/optional | If DFSG-packaged |
| ola (DMX) | packed/optional | Own fixtures |
| esptool | packed/Tier1 | Own ESP flash |
| strongswan | Tier1/packed | Size gate |
| openvswitch-switch | packed | Net virt |
| masscan | optional | Own nets only |

---

## 6. Operator decisions needed

1. **Edge gear beyond FX4100:** which vendor manuals to prioritize (UniFi vs MikroTik vs Cisco public vs Omada) — buy/repurpose **classes** only.  
2. **Guest pick:** OPNsense appliance vs Debian jump for first `golden-netmgmt`.  
3. **Virt layer priority:** mininet vs containerlab vs defer GNS3.  
4. **Kali crib breadth:** net-only vs net+forensics-lite vs add more dev tools (size).  
5. **Windows portable Wireshark on qodesh:** fetch now (~110 MB) vs defer.  
6. **Volume compression:** btrfs/zfs on VM disk vs only tar.zst layers.

---


## 7. Fetch / pack status (this pass)

See `/workspace/knowledge/netmgmt/MANIFEST.md` for live fetched vs deferred.

| Done | Item |
|------|------|
| yes | FETCH-POLICY allowlist extended (vendors, wireshark, mitmproxy, HA, …) |
| yes | LISA seed PDFs (7) from Researcher SEEDS.md |
| yes | RFCs netops + PPP/DSL family (39) |
| yes | pfSense PDF, UniFi QSGs, OPNsense HTML+zip, MikroTik pointers |
| yes | mitmproxy 11.0.2 linux tarball (CORE) |
| yes | Debian core debs (tcpdump/tshark/ngrep/vim/mosquitto) |
| yes | HA ontology tree (transport/wireless/lighting/platforms/runbooks) |
| yes | `bin/kit` stub + package lists + fetch-*-debs.sh |
| yes | `netmgmt-docs.tar.zst` + `layers/home-automation.tar.zst` |
| yes | Self-serve OPNsense 26.7 fetch: `install-media/fetch-opnsense-iso.ps1/sh` (`-OutDir`, `-Mirror`) + SHA256 pin — **ISO blob not kept in tree** |
| yes | Kit disk design `kit-disk/README.md` + build/create-VM scripts |
| defer | Wireshark Win Portable, Zeek/Suricata, full Kali-crib debs, Cisco/Juniper, MikroTik PDF bulk, HA runtimes |

**Recommended guest mount:** `/opt/netmgmt-kit`  
**Helper:** `/opt/netmgmt-kit/bin/kit` (stub at `knowledge/netmgmt/bin/kit`)


## Document control

| Field | Value |
|-------|-------|
| Path | `/workspace/reviews/release/NETMGMT-OUT-OF-BOX-KIT-2026-09-12.md` |
| Date | 2026-09-12 |
| LISA catalog | `/workspace/knowledge/lisa-seed/SEEDS.md` |
| FX4100 | `/workspace/knowledge/fx4100/` |
| Policy | `/workspace/knowledge/FETCH-POLICY.md` (netmgmt rows appended) |


## 8. Operator distribution model (LOCKED 2026-09-12)

**Do not** redistribute a full pre-built OPNsense VM/OVA appliance from us (size · licensing · update pain).

| Piece | Source | Operator action |
|-------|--------|-----------------|
| **OPNsense OS** | Official DVD ISO only (`opnsense.org` / mirrors) | Install yourself onto empty system VDI |
| **Netmgmt kit** | `grz-netmgmt-kit.vdi` and/or `grz-netmgmt-kit.iso` | Attach after install; mount/copy → `/opt/netmgmt-kit` |
| **Install media doc** | `NETMGMT-OPNSENSE-INSTALL-MEDIA-2026-09-12.md` | URLs, SHA256, fetch status |
| **Fetch (qodesh)** | `install-media/fetch-opnsense-iso.ps1 -OutDir <USB-or-large> [-Mirror URL]` (twin: `scripts/fetch-opnsense-iso.ps1 -Dest/-OutDir`) | C: ~9.1 GB / LocalAI — do not land ISO on C: |
| **Kit build** | `scripts/build-kit-disk.sh` · `build-kit-iso.sh` | Staging → VDI/ISO |
| **Create VM** | `scripts/create-netmgmt-vbox.ps1` | Empty sys VDI + official ISO + kit; NAT default; host-only optional; **bridged off** |

Guest mount path remains **`/opt/netmgmt-kit`** (browseable docs; packed runtimes). See compression policy.

Current official pin: **OPNsense 26.7** dvd-amd64 · SHA256 `95cafedda6d5b22ce832e249dc2309110fbee19f813ad78cf28bb3d387186bfb` (`.iso.bz2`).

**Self-serve:** we do not host the official ISO or package layers. Users/local caches pull them (`-Mirror` override). Kit docs ISO is the authored artifact.


## OPNsense / pf deep comprehension (locked 2026-09-12)

Guest **OPNsense** → first-class goal: deeply understand **`pf`** (FreeBSD packet filter), not Linux nft/iptables as primary.

Always-browseable docs under `/opt/netmgmt-kit/docs/pf/`:
- FreeBSD Handbook: Firewalls / pf chapters (from existing OS handbooks pack + fetch)
- `pf.conf(5)` / `pfctl(8)` manpages
- OPNsense docs: firewall rules, NAT, aliases, scrub, normalization, traffic shaping hooks
- Lab runbooks on golden snap: tables, anchors, state policy, logging, WAN↔LAN asymmetric gotchas

Practice loop: edit in OPNsense UI → dump equivalent `pfctl -sr` / `pfctl -vvsr` → correlate with kit docs.

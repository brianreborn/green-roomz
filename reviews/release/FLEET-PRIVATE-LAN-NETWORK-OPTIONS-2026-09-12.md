# Fleet + private LAN network options — practical planning summary — 2026-09-12

**Audience:** operator Brian  
**Priority:** planning for **private LAN stand-up soon** (segmented, harden-default, Green-Roomz peer model); complements offline security workstation image track — does **not** replace dispatch P0 freeze gate.  
**Hard rules (inherited):** defensive only · no exploits/PoCs · no plaintext creds · **no WAN bind / no tunnel punch until allowlist+key UAT** · no `git push` unless asked · dual-team path ownership · do not invent that Brian owns specific gear.

**Synthesized from (real boards + memory themes + 2026 web class research):**
- `/workspace/reviews/release/OFFLINE-SECURITY-WORKSTATION-PLAN-2026-09-12.md`
- `/workspace/reviews/release/GOAL-UPDATE-3OS-NOTE9VM-2026-09-12.md`
- `/workspace/reviews/release/PLANNING-PACKAGE-2026-09-12.md`
- `/workspace/reviews/release/DUAL-TEAM-SYNC-HANDOFF-2026-09-12.md`
- `/workspace/reviews/release/FLEET-LIVE-CONSOLE-DEPLOY-2026-09-12.md` (host matrix cross-check)
- Memory themes: new ISP → tunnel punch-through **design**; peer allowlist redesign; fleet hosts; FreeBSD density
- Web (2026): small-lab gear **classes** + commonly cited example models — **[E]** = cited recommendation class; **[S]** = speculation / operator choice; **[OWN]** = only claim ownership when boards say so (none of the buy-list is claimed owned)

---

## TLDR

- **Fleet today:** qodesh + shalom (Windows dogfood), godslove (FreeBSD-ish target), note9 (Termux client + **VM ship cell**), pixel8 (Android client track), assistant Linux box, dual SuperGrok teams (THIS live / OTHER quota-idle).
- **Ship brand:** offline security workstation **image matrix** (3 OS × workstation + Note9 VM) — peer/tunnel stays **design-only** until allowlist+key UAT; no WAN until then.
- **Private LAN soon:** prefer segmented VLAN lab with default-deny; USB+adb first for note9 (not Wi-Fi) until peer UAT.
- **New ISP:** enables tunnel punch-through *design* (NAT/CGNAT relief) — still no world bind without key; Green-Roomz `allow_peers` is the gate.
- **Gear integration:** buy/repurpose **classes** only (managed VLAN switch, OPNsense/pfSense/OpenWrt edge, Wi-Fi 6/7 AP, USB-Ethernet OTG, WireGuard / Headscale / NetBird / ZeroTier overlays) — **do not invent ownership**.
- **Next:** inventory existing modem/switch/AP → pick topology A/B/C → draft VLAN + peer CIDR → wire Roomz allowlist configs → USB+adb note9 path → airgap kit NIC posture.

---

## 1. Fleet inventory

Mark: **[E]** board/memory evidence · **[S]** open / not yet registered.

| Host | Role | OS / base | Connect path (now) | Roomz / Green role | Notes |
|------|------|-----------|--------------------|--------------------|-------|
| **qodesh** | Build / dogfood / USB hub | Windows | ListMachines registered (`19f2c19e-…`); local-exec; USB Allow for note9 | Roomz #4 degraded Windows; fuzz host; FIX-01 bounce target | Athlon / **never GGUF on 8600 GT**; dirty tree → OTHER Agentz #2 |
| **shalom** | Laptop dogfood / VL / downloads | Windows | Registered (`801f51e6-…`); offline to box as of 2026-09-11 heartbeat | Roomz #1 VL; OTHER fetch-models / Unicorn on wake | Vulkan mid tier (T2) when online |
| **godslove** | FreeBSD target / densify BSD story | FreeBSD 15 / PQFreeBSD (i7-620M) **[E]** Roomz #5 | Not registered as live machine this pass | Future host tip; `freebsd.mjs` / `agents.freebsd.json` still open | Aligns 2022 FreeBSD/security density; OTHER owns bring-up when box exists |
| **note9** (phone) | Client / Issue #2 UAT | Samsung Note9 SM-N960U · Termux · no root | **USB + adb from qodesh** preferred; **not** in ListMachines | T0 tool-router ~0.5B; security-monitor + allow_peers design | Serial historically `27841130ae1c7ece`; Wi-Fi peer = post-UAT |
| **note9 VM** | **Ship cell** (guest) | Guest on any of 3 OS bases | Via hypervisor on qodesh or kit workstation; USB+adb conduit from Windows dogfood | Same Green-Roomz payload family as workstation images | Orthogonal to phone Termux track |
| **pixel8** | Android client track | Android / Termux-class | Out of primary cut; host tip stale `@260db2a` | Roomz #3 awareness | OTHER/later; T0-class |
| **assistant Linux box** | THIS team integrate / reviews / fleet-console | Linux | Local `/workspace`; fleet-console `start-watch-box.sh` | Image-matrix docs; DISPATCH integrate; knowledge-lib | Not the released OS image brand |
| **Offline kit host** | T3 airgap UAT target | **3 lines:** FreeBSD/pqfreebsd · Debian-class · HardenedBSD | NIC down / default-deny; USB SSD or hybrid ISO | Green-Roomz + defensive suite + model packs | SKU **open Q**; no WAN required for S1–S7 |
| **THIS SuperGrok** | Active dual-team slot | — | Box + issues/boards | Image matrix, Note9 VM docs, dispatch P0, fleet-console | New Bot + specialists |
| **OTHER Researcher `09f2d365…`** | Dual-team slot | — | Idle — SuperGrok quota | Windows/shalom downloads, Agentz #2, Roomz #4 | Wake = event-driven; no guessed ETA |

**Dual-team collision (short):** one integrator for `gateway.mjs` / routing / Brainz / `main`; THIS holds note9 paths + image matrix; OTHER holds Windows agents / fetch-models / dirty qodesh audit; communicate via GitHub issues + `/workspace/reviews/*`.

---

## 2. Private LAN topology options (2–3)

All options assume: **harden-default** (default-deny firewall), **segmented** (mgmt vs lab vs airgap), **Green-Roomz peer allowlist** before any non-loopback bind, **no WAN exposure until UAT**.

### Option A — Simple VLAN lab (recommended first stand-up)

```
[ISP modem/ONT] --bridge/passthru--> [edge router: OPNsense|pfSense|OpenWrt]
                                            |
                                   [managed switch 802.1Q]
                                      /    |     \
                              VLAN10     VLAN20    VLAN30
                              mgmt       lab       IoT/guest
                              (qodesh,   (kit,     (phones Wi-Fi
                               switch,    godslove,  SSID only;
                               AP ctrl)   box SSH)   no Roomz bind)
```

| Property | Value |
|----------|-------|
| Fit | Fastest path to “private LAN soon” with clear segments |
| Edge | Single firewall appliance; LAN-side only for Roomz peers |
| note9 | **USB+adb to qodesh** on mgmt/lab; Wi-Fi SSID on VLAN30 **without** Roomz listen until allowlist UAT |
| Airgap kit | Prefer **physical NIC unplugged** or port in isolated VLAN with no uplink; not “guest Wi-Fi” |
| Pros | One box to harden; VLAN trunks scale; matches Green-Roomz LAN peer model |
| Cons | Single router SPOF; need managed switch + VLAN-aware AP |

### Option B — Dual-router (WAN edge + lab core)

```
[ISP] --> [ISP gateway / cheap edge] --> [lab core: OPNsense/MikroTik]
                                              |
                                         [managed switch]
                                              |
                              lab VLAN(s) + optional mgmt VLAN
```

| Property | Value |
|----------|-------|
| Fit | When ISP modem must stay in router mode, or operator wants double NAT as deliberate isolation |
| Edge | Outer = ISP or light OpenWrt; inner = full policy (WireGuard listener **after** UAT, Suricata optional) |
| Punch-through | New ISP may allow inbound on outer; still terminate only on **allowlisted** inner peers — design only until keys |
| Pros | Clear trust boundary; lab can stay up if outer reboots; easier “no WAN until UAT” on inner |
| Cons | More hops/latency; double-NAT headaches for games/VoIP; two configs to keep |

### Option C — Airgap kit vs management LAN (strict)

```
Management LAN (VLAN10): qodesh, shalom, box SSH, AP controller, switch mgmt
Lab LAN (VLAN20):        godslove, pixel8 Wi-Fi (later), Roomz peer CIDR (post-UAT)
Airgap kit:              USB/Ethernet dongle ONLY when imaging; else NIC down / no switch port
note9 phone:             USB+adb → qodesh (not on airgap fabric)
```

| Property | Value |
|----------|-------|
| Fit | Matches offline workstation success criteria S1/S7; strongest default for kit UAT |
| Green-Roomz | Kit stays loopback-only through Phase D; peers are **design**; phone client uses adb-forward |
| Pros | Hard to accidentally WAN-expose the kit; clear operator mental model |
| Cons | Requires discipline (no “just plug the kit into the house switch”); may need a dedicated USB Ethernet for kit |

**Pick guidance:** start **A** if a managed switch is available or buyable soon; use **B** if ISP modem cannot go bridge; always keep kit posture from **C** regardless of A/B.

---

## 3. Network equipment integration possibilities

**Do not invent ownership.** Treat as **buy / repurpose classes**. Example models are **commonly recommended in 2026 homelab write-ups** — not an assertion Brian already has them.

### 3.1 Edge router / firewall OS

| Class | Role for this fleet | Example models / SKUs **[E]** | Fit note |
|-------|---------------------|------------------------------|----------|
| **OPNsense on x86 mini-PC** | Primary lab firewall: VLANs, WireGuard, optional Suricata, API | Protectli VP2420-class; Intel N100/N150/N305 4×2.5GbE fanless (Topton X2E/X2B, CWWK X86-P5/P6 class) | Strong WireGuard + UI story in 2026 comparisons |
| **pfSense (CE/Plus)** | Same class if operator already knows pfSense | Netgate 4100-class; same N100 multi-NIC boxes | Stay if rules already exist; migration cost real |
| **OpenWrt** | Low-power edge, Wi-Fi router reuse, simple WAN | Consumer router flash; SBC; light x86 | Best for watts / repurpose; thinner IDS story |
| **MikroTik RouterOS 7** | Pure router + VLAN + BGP; optional ZeroTier client | RB5009 / CCR2004-class | CLI-heavy; strong when multi-gig + advanced routing |

**[S]** Which OS Brian prefers is an open operator question — FreeBSD density on the **kit** is orthogonal (godslove / image matrix); edge firewall can still be OPNsense (FreeBSD-derived) for continuity.

### 3.2 Managed switches (802.1Q)

| Class | Role | Example models **[E]** |
|-------|------|------------------------|
| **Value SDN switch** | Port VLANs, PoE for APs | TP-Link Omada / JetStream (e.g. SG3210XHP-M2-class 2.5G+PoE) |
| **Premium SDN switch** | Same + deeper UI | UniFi switch line (USW-Enterprise / Pro class) |
| **CLI / cheap 10G** | Lab density, SFP+ | MikroTik CSS610 / CRS class |
| **SMB familiar** | Basic VLAN UI | Cisco CBS / Netgear smart-managed class |

Unmanaged switches **cannot** do the segmented plan — upgrade or add one managed hop.

### 3.3 Wi-Fi 6 / 7 APs

| Class | Role | Example models **[E]** |
|-------|------|------------------------|
| **Wi-Fi 6 workhorse** | Lab/guest SSIDs mapped to VLANs | Omada EAP670-class; UniFi U6-class |
| **Wi-Fi 7 mid** | Future-proof tri-band | UniFi U7 Pro-class; Omada EAP730/EAP780-class; Zyxel NWA130BE-class |
| **Rule** | Prefer **dedicated AP** over Wi-Fi on the firewall appliance | pfSense/OPNsense wireless support is weak vs dedicated APs |

Map SSIDs → VLANs: e.g. `grz-lab` → VLAN20, `grz-iot` → VLAN30, **no** Roomz bind on IoT SSID.

### 3.4 USB Ethernet / phone wiring

| Class | Role | Notes |
|-------|------|-------|
| **USB-C / micro-USB OTG → Ethernet** | Wired phone on lab VLAN **without** Wi-Fi | Adapter class (USB-NIC); Android may expose as `eth0` to system — Termux networking is usually fine for TCP once Android owns the NIC |
| **USB+adb (preferred first)** | note9 Issue #2 + VM conduit from qodesh | **[E]** GOAL-UPDATE §4 — not in ListMachines; Allow on host is operator action |
| **USB-serial / FTDI** | Console into switches/routers from a tablet | Optional ops aid; not Roomz path |
| **Speculation flag** | Bridging raw USB-NIC into Termux/QEMU without root is fiddly | Prefer Android-owned Ethernet or stick to **adb reverse/forward** for Roomz UAT |

### 3.5 Overlay / tunnel punch-through (private LAN + new ISP)

**Theme [E]:** new ISP enables tunnel punch-through **design** (better chance of inbound / less hostile CGNAT). Still: **no world bind without key**; Roomz peer allowlist remains the app-layer gate.

| Class | Control plane | When to consider |
|-------|---------------|------------------|
| **WireGuard native** | DIY keys + peer list on OPNsense/OpenWrt | Simplest align with Roomz `allow_peers` CIDR; full ownership |
| **Tailscale** | Vendor SaaS | Fast dogfood; **[S]** may conflict with airgap / no-cloud kit goals |
| **Headscale** | Self-host Tailscale-compatible coord | Private mesh without Tailscale SaaS |
| **NetBird** | Self-host or cloud; WireGuard; ACL UI | Strong 2026 self-host alternative |
| **ZeroTier** | Central or self-host controller | L2-ish / odd topologies; MikroTik has native client interest |
| **Nebula / Netmaker** | Self-host | Advanced / container-edge — optional later |

**Green-Roomz posture:** overlays carry **encrypted transport**; app still must **403** non-allowlisted peers. Design order: (1) loopback/adb UAT → (2) LAN CIDR allowlist → (3) WG/overlay CIDR → (4) never “open 0.0.0.0” for ship.

### 3.6 Offline security workstation networking

| Need | Integration |
|------|-------------|
| Airgap UAT | NIC down **or** dedicated switch port with no uplink (Option C) |
| Observe-only capture | tcpdump/wireshark-class on kit — **[kit-add]** from workstation plan |
| Management without WAN | Temporary USB Ethernet to mgmt VLAN only for updates; then unplug |
| Model pack / image | USB SSD / hybrid ISO — not network fetch at run time |

---

## 4. Green-Roomz integration

| Topic | Plan |
|-------|------|
| **`allow_peers`** | Intentional lists per host config (`agents.note9.json`, windows agents, future freebsd agents). Loopback-only OK through ship of phone client. LAN CIDRs only after operator lists them. |
| **Peer allowlist redesign** | Memory theme + commit lineage `87e91ad` / `docs/deployment.md`: LAN peer **403** if not listed; no world bind without key. |
| **Tunnel design** | Document WG (or Headscale/NetBird) endpoints **as design**; punch-through assumes new ISP cooperates — still terminate on allowlisted peers only. |
| **No WAN until UAT** | Freeze/image criteria S7; PLANNING-PACKAGE effort #5; dual-team: no public bind hygiene on OTHER Windows path either. |
| **note9 USB vs Wi-Fi** | **USB+adb first** (GOAL-UPDATE). Wi-Fi on private SSID only after allowlist+key UAT; prefer lab VLAN, not guest. |
| **Monitor stubs** | lockdown/reboot **reject** only — unchanged by LAN stand-up. |
| **Fleet-console** | Host-local stats only; do not scrape Windows into Linux console over LAN “for convenience.” |

---

## 5. Immediate next 8 tasks (private LAN stand-up)

1. **Operator inventory (15 min):** ISP modem model + mode (bridge vs router); any existing managed switch / AP / spare mini-PC — write answers into §6 without inventing gear.
2. **Pick topology:** A (simple VLAN), B (dual-router), or A+C kit posture — record choice on this board as a dated addendum.
3. **Draft VLAN map:** IDs + subnets for mgmt / lab / IoT (and airgap-isolated port policy); leave IPv6 on/off as operator Q.
4. **Draft peer CIDR stub:** proposed `allow_peers` entries per host (loopback now; LAN TBD) — no live bind yet.
5. **Edge OS choice:** OPNsense vs pfSense vs OpenWrt vs MikroTik for the **first** lab edge — align with FreeBSD familiarity if desired.
6. **note9 first-connect:** USB Allow on qodesh + `adb devices` enum; keep Roomz on localhost/`adb forward` only (Issue #2).
7. **Kit NIC discipline:** label airgap kit port / USB-NIC; add checklist line to offline UAT (NIC down before Roomz smoke).
8. **Dual-team note:** THIS owns LAN design boards + note9 allow_peers; OTHER does not open Windows public bind; ping coord issue when filed — no push.

---

## 6. Open questions for operator

1. **ISP modem mode:** bridge/passthrough available, or must stay router (forces Option B)? Any CGNAT or true public IPv4/IPv6 after the new ISP cutover?
2. **Existing switch / AP:** any managed 802.1Q switch or VLAN-capable AP already on-site to **repurpose** (model names welcome)?
3. **IPv6:** enable dual-stack on lab VLANs, or IPv4-only until Roomz peer code is proven on v4?
4. **Budget band:** under ~$300 (OpenWrt reuse + small Omada switch), ~$300–800 (N100 firewall + PoE switch + Wi-Fi 6 AP), or ~$800+ (UniFi / multi-gig / Wi-Fi 7)?
5. **Tunnel preference:** pure WireGuard DIY vs Headscale vs NetBird vs “defer overlay until LAN UAT green”?
6. **Kit host SKU:** which physical machine is the T3 offline UAT box (affects whether it shares the lab switch)?
7. **godslove timing:** is FreeBSD host arriving soon enough to plan a lab VLAN port reserved for it?
8. **Wi-Fi for note9:** hard ban until peer UAT, or allow phone on IoT SSID with **Roomz bind still loopback-only**?

---

## Document control

| Field | Value |
|-------|-------|
| Created | 2026-09-12 |
| Method | Consolidate release boards + memory themes + 2026 gear **class** research |
| Explicitly not used as fact | Invented ownership of specific switches/APs/routers; invented peer CIDRs; WAN punch recipes; offensive tunnel bypass |
| Companions | Offline workstation plan · GOAL-UPDATE 3OS+Note9VM · PLANNING-PACKAGE · DUAL-TEAM-SYNC · FLEET-LIVE-CONSOLE-DEPLOY |
| Evidence tags | **[E]** board/web-cited class · **[S]** speculation / open pick · **[OWN]** only when boards assert ownership (none on buy-list) |


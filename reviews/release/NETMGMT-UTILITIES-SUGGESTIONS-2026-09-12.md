# Netmgmt VM — utility suggestions (compact + volume compression OK)

**Date:** 2026-09-12  
**Guest stance:** Debian-hardened jump *or* OPNsense appliance + shared kit volume.  
**Base packages:** Operator **APPROVED** Tier 0/1 suggestions (2026-09-12) — lock as kit defaults.

**Compression (locked):** Transparent **FS/volume** compression (btrfs zstd / squashfs mount / similar). **Docs are normal files** under `/opt/netmgmt-kit/docs` — never “open an archive to read.” Explicit `tar.zst` unpack is **runtimes only**. See `NETMGMT-COMPRESSION-POLICY-2026-09-12.md`.

## Tier 0 — always unpacked (tiny)

| Utility | Why |
|---------|-----|
| **vim** (+ `vim-tiny` fallback) | Operator request; everywhere editing |
| **mitmproxy / mitmdump / mitmweb** | KEY lab TLS inspect on OWN traffic |
| **tcpdump**, **tshark** (wireshark-cli) | Packet capture/analysis core |
| **iproute2**, **bridge-utils**, **vlan** | Net virt / VLAN day-1 |
| **openssh-client/server**, **curl**, **jq**, **git** | Ops glue |
| **tmux**, **rsync**, **less**, **ripgrep**/`grep` | Session + search |
| FX4100 doc index + RFC seed (1918, DHCP, SLAAC, DNS) | Your WAN CPE + basics |

## Tier 1 — core apt (install in golden snap)

| Cluster | Packages (Debian-ish names) |
|---------|-----------------------------|
| Capture / analyze | `wireshark`, `termshark`, `ngrep`, `tcpflow`, `editcap`/`mergecap` (wireshark-common) |
| Discover / path | `nmap`, `masscan` (optional), `traceroute`, `mtr-tiny`, `iperf3`, `netcat-openbsd`, `socat`, `arp-scan` |
| DNS / DHCP lab | `bind9-dnsutils` (`dig`/`nslookup`), `ldnsutils`, `isc-dhcp-client`, `radvd` (docs; run carefully) |
| VPN / tunnels (lab) | `wireguard-tools`, `openvpn`, `strongswan` (packed if large) |
| Editors / dev | **vim**, `neovim` (optional), `micro`, `build-essential`, `python3-venv`, `python3-pip` |
| Net virt | `bridge-utils`, `uml-utilities` (optional), `openvswitch-switch` (packed), containerlab/mininet as **packed layer** |
| Kali-crib (metapackage crib, not full ISO) | From Kali net/forensics *ideas*: above + `ettercap-text-only` only if policy OK — prefer **mitmproxy** over classic MITM suites for lab HTTPS |

## Tier 2 — packed `tar.zst` / squashfs (on-demand)

| Layer | Contents |
|-------|----------|
| `lisa-netops` | USENIX LISA seed PDFs (from `/workspace/knowledge/lisa-seed/SEEDS.md`) |
| `vendor-manuals` | OPNsense/pfSense public docs, Ubiquiti/Mikrotik free PDFs, **Inseego FX4100** |
| `zeek-suricata` | Zeek + Suricata offline debs + GeoIP DB policy |
| `gns3-containerlab` | GNS3/containerlab bits if license/size OK |
| `devtools-heavy` | golang toolchain, optional node, large IDEs |
| `legacy-access` | **POTS/DSL/PPP** docs + tools (below) |
| `home-automation` | Ontology tree + HA/Z2M/ESPHome packed runtimes; lighting ≠ X-10 |

## Legacy / older plant (POTS, DSL, PPP) — include

Docs (official/free RFCs + vendor archives where clear):

| Topic | What to ship |
|-------|----------------|
| **PPP / PPPoE** | RFCs 1661, 2516; `pppd`/`rp-pppoe` packages; troubleshooting cheat-sheet (auth, MTU 1492, renegotiation) |
| **DSL / ATM (ADSL/VDSL)** | ITU overview notes + **modem/ONT bridge vs router** modes; DSL forum/public whitepapers if freely licensed; sync/SNR/CRC **read-only** interpretation guide |
| **POTS / dial** | Historical: `minicom`, `screen` for serial consoles (also useful for managed switches); **soft** note on FXO/FXS — docs only, no PSTN abuse |
| **Serial console** | `minicom`, `picocom`, `setserial`; USB-UART udev notes for common FTDI/CP210x (driver packages) |
| **Cable / DOCSIS (home)** | Public CableLabs overview + “bridge mode + own router” checklist (pairs with FX4100 IP-passthrough docs you already have) |
| **ISDN / Frame Relay** | Doc-only museum layer (compressed); rarely needed but good for old campus gear |

Tools that still earn space:

- `minicom` / `picocom` — serial (POTS-adjacent + switch console)
- `pppoeconf` / `ppp` — lab PPPoE client against a local concentrator VM
- `socat` — generic serial/TCP bridges
- Optional packed: old Cisco IOS **docs** (not images) for CLI muscle memory

## Volume layout (recommended)

```text
/opt/netmgmt-kit/
  core/          # Tier 0 always live
  docs/ (transparent volume) + packed/*.tar.zst (runtimes only)
  bin/kit        # list | unpack <layer> | verify
```

Host VirtualBox: kit disk as second VDI, **compressed** (or pre-built squashfs file on shared folder). Snapshot `golden-netmgmt` after Tier 0+1 installed; Tier 2 stays packed.



## Home automation / IoT (X-10 → modern) — include

**Ontology:** see `NETMGMT-HA-ONTOLOGY-2026-09-12.md` — X-10/Insteon/UPB/KNX/Lutron systems/MQTT → `transport/`; Zigbee/Z-Wave/Matter/Wi‑Fi IoT → `wireless/`; DALI/0-10V/DMX/Hue/LIFX → `lighting/`; HA/ESPHome/Z2M → `platforms/`.

Packed layer name: `home-automation` (docs always; heavy runtimes on-demand).

### Legacy

| Item | Ship |
|------|------|
| **X-10** | Protocol overview + CM11A/CM17A PC interface notes; `heyu` or similar if in Debian/universe; serial wiring cheat-sheet |
| Insteon / UPB (doc-only) | Public protocol summaries where freely available — museum/interop |

### Current standards & stacks

| Standard / stack | Docs + packages |
|------------------|-----------------|
| **MQTT** | Official OASIS MQTT specs overview; `mosquitto`, `mosquitto-clients` in Tier 1 apt |
| **Zigbee** | Zigbee Alliance/CSA public intros; Zigbee2MQTT official docs (packed); coordinator stick udev notes (no firmware dumps of proprietary blobs unless clearly redistributable) |
| **Z-Wave** | Z-Wave Alliance public docs; `zwave-js` docs link pack (Node layer packed) |
| **Matter / Thread** | CSA Matter primers; OpenThread guides (official); border-router concepts |
| **Home Assistant** | Official `home-assistant.io` docs snapshot (packed zstd); Core install deferred to unpack — large |
| **ESPHome / ESP8266/ESP32** | Official ESPHome docs; `esptool` in apt/packed for own hardware flash |
| **Apple HomeKit / Google Home / Alexa** | High-level interop notes only (no reverse-engineer bridges) |

### Packages (Debian-ish)

| Tier | Packages |
|------|----------|
| Tier 1 apt | `mosquitto`, `mosquitto-clients`, `python3-paho-mqtt` |
| Packed | Home Assistant container/venv tarball, Zigbee2MQTT, Node-RED (optional), `esptool` + ESPHome wheel cache |
| Serial helpers (already) | `minicom`/`picocom` for X-10 interfaces and USB coordinators |

### Skills / runbooks (markdown in kit)

1. `x10-lab.md` — safe bench with CM11A + lamp module (own gear)
2. `mqtt-broker-lab.md` — local Mosquitto, ACL basics, TLS optional
3. `zigbee-coordinator-bringup.md` — flash/permit-join high-level from official Z2M docs
4. `matter-thread-overview.md` — fabric concepts for home VLAN segmentation
5. `iot-vlan-segmentation.md` — put IoT on isolated VLAN (ties to netmgmt golden)

### Hard rules

- Own-lab / own-devices only; no “attack smart bulb” guides
- Prefer official CSA / HA / Mosquitto / ESPHome / Zigbee2MQTT documentation
- Proprietary mobile apps: link-only, do not redistribute APKs




### Taxonomy note (don’t overfit)

Categories are **capabilities / media**, not brand buckets. A protocol that controls lamps *and* appliances belongs under **general HA transport**, not under Lighting.

| Bucket | What belongs | What does NOT |
|--------|--------------|---------------|
| **HA transport / control buses** | X-10, Insteon, UPB, KNX (whole-home), MQTT as IoT bus | “Lighting-only” label |
| **Lighting-specific** | DALI, 0–10V, phase-cut/trailing-edge *as dimming plant*, DMX512/RDM, Hue/LIFX light APIs, Matter *light* clusters when discussing luminaires | X-10, whole-home Insteon, generic Shelly relays |
| **Wireless device stacks** | Zigbee, Z-Wave, Thread/Matter fabrics, Wi‑Fi IoT (Shelly/Kasa/Tasmota) | Forced into Lighting because a bulb exists |
| **App platforms** | Home Assistant, ESPHome, Zigbee2MQTT | Protocol standards themselves |

### Lighting-specific (plant + luminaires)

Browseable under `/opt/netmgmt-kit/docs/home-automation/lighting/` — **lighting-specific only**.

| Era / tier | Item | Notes |
|------------|------|-------|
| Wired plant | **DALI**, **0–10V**, phase-cut / trailing-edge | Drivers/ballasts, dimming curves |
| Stage / arch | **DMX512** / RDM | `ola` optional; universe addressing |
| Premium ecosystems | **Philips Hue**, **LIFX**, **Nanoleaf** | Official integration docs; bridge/VLAN |
| DIY firmware (when used as lights) | ESPHome/Tasmota *light* components | PWM/CCT/RGBCT — device firmware lives under DIY; light profiles cross-link here |
| Mesh luminaires | Zigbee/Z-Wave/Matter **light devices** | Pairing via Z2M / Z-Wave JS / Matter — stacks documented under wireless; device profiles here |

### General HA transport (includes devices that happen to be lamps)

Browseable under `/opt/netmgmt-kit/docs/home-automation/transport/` (not under `lighting/`).

| Item | Why not under Lighting |
|------|------------------------|
| **X-10** | House/unit codes for lamps *and* appliances; powerline/RF transport |
| **Insteon / UPB** | Whole-home control bus |
| **KNX / Lutron** (whole systems) | Building/home control; lighting is one application — put *system* docs here; dimmer-specific app notes may cross-link to lighting/ |
| **MQTT** | IoT message bus |

Cross-links OK (`transport/x10.md` → “often drives lamp modules”); **primary path must not be `lighting/x10`**.


## Explicitly defer / careful

- Full **Kali ISO** as guest — no; crib packages into Debian/OPNsense jump instead  
- Wireless attack suites, exploit frameworks — **out** (defensive kit only)  
- Commercial book scans — cite/own path only  

## Operator decisions (optional)

1. Guest primary: **OPNsense appliance** vs **Debian jump** (kit volume works for both)?  
2. Nested virt: enable VirtualBox nested VT-x for containerlab, or keep net virt as bridges/namespaces only?  
3. Any specific DSL modem / ONT brand beyond FX4100 to prioritize manuals for?

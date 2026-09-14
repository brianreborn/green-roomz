# Fleet targets (workers)

Job unless noted: **0.5B Q4**, short completion, thinking off.
Artifact on disk: `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` **432 MiB** / **593 M** params.
`tok/W = tok/s / W_load`. `J/tok = W_load / tok/s`.
`meas` = timed here. `est` = estimate from known class. `hyp` = silicon guess, **no shell yet**.
Panel watts = display on (TVs/monitors dominate J/tok).

**Chart rule:** if we know enough SoC/RAM to guess 0.5B Q4 → put a **`hyp`** (or `est`) bar.
**`0` / blank only** when we **cannot really guess** (no usable CPU story, or MCU with no GGUF path).
Not “0 until shell” for every unshelled box — shell upgrades `hyp`→`meas`.

**RAM gate:** need ~1 GB free userspace after OS to mmap 432 MiB + KV. hyp tok/s is **CPU-if-loaded**. Unknown modem/AP RAM that is typically <1 GB → treat as **conditional**; miss → 0 even if the CPU could run it.

**Policy:** own-device exploit OK. Worker **alongside** system software.
Operator names the box; this file holds SoCs / reset notes.

**UART:** USB-UART + cisco/ethernet console on hand.

Charts list **every considered device**. Rejects = one line only (MCU-class stay at 0).

**Reset column:** can we recover from a backup / stock ROM after a bad flash?

Bar scale: tok/s 1#≈1; tok/W 1#≈0.25; J/tok 1#≈1 J. Width 40 (clip; shalom CPU 48 overflows).

**Shalom 0.5B vs 4B/7B:** live GRZ nexus is CPU `--threads 2 --device none` so the APU stays free for 4B/7B. Fleet 0.5B number is a **dedicated worker** (full CPU), not that nexus. On 7520U the 2-CU 610M (no matrix cores) **loses** 0.5B generation to CPU.

---

## Intake SOP (parallel)

1. FCC ID → internals / OpDesc silk  
2. OpenWrt ToH / WikiDevi / TechInfoDepot  
3. `"model" UART|OpenWrt|root|sdb|firmware`  
4. Cousin SKUs  
5. **Reset:** stock image URL / dual-boot / USB recovery / factory partition  

---

## tok/s

```
shalom      48    meas  ########################################   2026-08-29 CPU ngl0 tg8 (clip@40); Vulkan ngl99 tg8=8.4
pixel8      20–40 est   ################################........
note9       23.8  meas  #######################.................   2026-08-29 CPU 4t tg32 (pp64=36.8); no root
EN2251       4–10 hyp   ##########..............................   Puma7 dual Atom if shelled AND ≥1GB free
godslove     4–8  est   ########................................
qodesh       3.0  meas  ###.....................................   2026-08-29 8-tok; was 2.5
SAX2V1R      2–6  hyp   ######..................................   AP CPU free; SoC ≠ SAX1 IPQ8072A
QD65NF       2–6  est   ######..................................   MT9602 4×A53@1.5; SoC max 2GB
TU7000       1–4  hyp   ####....................................   Crystal Processor 4K, Tizen 5.5
E472VLE      0.2–1 hyp  #.......................................   2012 VIA; marginal for 0.5B
K243Y        0    hyp   ........................................   scaler MCU — no GGUF
IMW1202      0    hyp   ........................................   BT audio MCU
CKS5TW       0    hyp   ........................................   TWS / aptX path MCU
J3B          0    hyp   ........................................   BT headset/dongle MCU
```

## tok/W

```
pixel8      5–8     est ################################
shalom      2.7–4.0 meas ############........................    48 tok/s / 12–18 W
note9       3–5     est ################........................   23.8 tok/s / 5–8 W load
EN2251      0.4–1.0 hyp ####....................................   ~10–17 W Hitron wall
SAX2V1R     0.2–0.6 hyp ##......................................   ~8–15 W AP load
godslove    0.10–0.20 est #.......................................
qodesh      0.05–0.06 meas ........................................   ~55–65 W load assumed
TU7000      0.01–0.04 hyp ........................................   panel ~80–120 W on
QD65NF      0.02–0.05 est ........................................   55" rated 125 W
E472VLE     0.01–0.05 hyp ........................................   old panel+SoC
K243Y / IMW1202 / CKS5TW / J3B   0  (cannot run 0.5B)
```

## J/tok

```
pixel8      0.15–0.3 est #.......................................
shalom      0.25–0.4 meas #.......................................   12–18 W / 48 tok/s
note9       0.3–0.7 est #.......................................
EN2251      1–3   hyp   ###.....................................
SAX2V1R     2–6   hyp   ######..................................
godslove    5–12  est   ############............................
qodesh      18–22 meas  ######################..................
TU7000      25–100 hyp  ########################################   panel dominates
QD65NF      25–80 est   ########################################   125 W / 2–6 tok
E472VLE     40–200 hyp  ########################################
K243Y / IMW1202 / CKS5TW / J3B   n/a (tok/s=0)
```

**hyp / meas basis:** shalom CPU ngl0 llama-bench tg8 **48.1±1.9** (build 10665); same box Vulkan ngl99 tg8 **8.4** (Radeon 610M 2 CU, `matrix cores: none`) — keep Vulkan for 4B/7B, not 0.5B. EN2251 ≈ dual Atom vs godslove/qodesh **if RAM loads**; SAX2 ≈ 2–4×A53 if main CPU freed (cousin SAX1 IPQ8072A 4×A53@2.2 + 2 GB is stronger and **not** this SKU); TU7000/QD65NF ≈ TV ARM + panel watts; E472 ≈ decade-old smart SoC; MCU rows = **0** on purpose (no userspace GGUF).

Rejected for not apparently very feasible as **workers**: K243Y, IMW1202, CKS5TW, J3B (still charted at 0; keep as CE practice).

---

## Class / shell / RAM

| id | class | shell now | RAM | 0.5B load? |
|---|---|---|---|---|
| **shalom** | live | GRZ | **16 GB** (15.3 GiB visible) | yes — **48 meas** CPU |
| **qodesh** | live | GRZ | **16 GB** DDR3 | yes — **3.0 meas** CPU |
| **godslove** | live OS | FreeBSD | **8 GB** | likely |
| **pixel8** | userland | KernelSU | 8 GB class | likely; no 0.5B meas yet |
| **note9** | userland (no root used) | ADB shell `/data/local/tmp/grz` on shalom | **5.7 GB** (MemTotal 5710492 kB; ~3.0 GB avail) | **SM-N960U / SDM845 / Adreno 630** — **23.8 meas** CPU tg32 |
| **QD65NF** | userland | ADB | SoC **max 2 GB** DDR3 | tight under Fire OS |
| **TU7000** | userland | SDB | unpublished | unknown; 4-core Crystal 4K |
| **SAX2V1R** | uart | none | unpublished (**≠** SAX1 2 GB) | unknown until silk |
| **EN2251** | uart | none | unpublished; Hitron **modem** SKU | **gate** — Puma 7 modem boards often <1 GB |
| **E472VLE** | uart | none | unpublished 2012 | marginal |
| **K243Y / IMW / CKS / J3B** | ce | none | MCU | no |

---

## W_load assumptions (tok/W denominator)

| id | W_load | basis |
|---|---|---|
| shalom | 12–18 | 7520U 15 W TDP; short 0.5B CPU, no extra panel in the worker number |
| qodesh | 55–65 | Athlon II + 8600 GT wall (assumed; not metered) |
| pixel8 | 4–6 | phone SoC load |
| note9 | 5–8 | phone |
| godslove | 25–40 | i7-620M 35 W TDP |
| EN2251 | 10–17 | Hitron EN2251-RES max **16.93 W** |
| SAX2V1R | 8–15 | 12 V AP class |
| QD65NF | ~125 | Hisense 55" rated **125 W** (panel on) |
| TU7000 | 80–120 | panel on, size-dependent |
| E472VLE | 40–80 | old panel+SoC |

---

## Table (all considered) + reset

| id | hardware | OS | tok/s | reset / backup ROM | programmable |
|---|---|---|---|---|---|
| **shalom** | Ryzen 5 **7520U** 4C/8T Mendocino 15 W; Radeon **610M 2 CU** RDNA2 (no matrix); **16 GB**; Win11 Home | Win11 | **48 meas** CPU ngl0 tg8 (Vulkan tg8 **8.4**) | N/A (PC; git) | live GRZ |
| **qodesh** | Athlon II X2; **8600 GT 224 MB sm_1.1** (CUDA 6.5 back-compat goal); 16 GB DDR3 | Win11 | **3.0 meas** CPU interim (was 2.5) | N/A (PC; git + GGUF on disk) | live GRZ; GPU path = **build**, not Vulkan |
| **godslove** | i7-620M; Ironlake/NVS; 8 GB | PQFreeBSD 15 | 4–8 est | FreeBSD install media / ZFS bootenv if set | CPU then GL |
| **pixel8** | Tensor G3; EdgeTPU | Android+KernelSU | 20–40 est | **Yes** — factory images / Android Flash Tool / fastboot | Termux/sidecar |
| **note9** | **SM-N960U** `crownqltesq`; **SDM845**; Adreno 630 (GLES 3.2); 8× Kryo; **5.7 GB**; Android 10 / API 29; serial `27841130ae1c7ece` | Android 10 | **23.8 meas** CPU 4t tg32 (pp64 **36.8**); pack in `/data/local/tmp/grz`, server `:8080` via adb forward | **Yes** — Odin/Heimdall stock + combo firmware widely mirrored | **no-root ADB shell now**; Termux Node gateway needs `allow-external-apps` or manual; OpenCL/Vulkan later |
| **QD65NF** | **55QD65NF** Costco Fire TV QLED; **MT9602** 4×A53 @ 1.5 GHz + Mali-G52 2EE MC1; SoC **max 2 GB** DDR3; 55" rated **125 W** | **Fire TV** | **2–6 est** | **Partial** — Fire TV USB recovery / Amazon factory reset; Hisense USB update packages exist by SKU; not as clean as Pixel fastboot. Confirm exact recovery menu on unit. | **ADB easy; full root not.** Sideload/dev options = Fire TV normal. No public one-click Magisk for this Fire OEM SKU. Cousin: Hisense **Google/VIDAA** U8N MT9618 has XDA Magisk (UART+fastboot unlock) — different OS/SoC. Fire sticks/Cubes have exploits; **OEM Fire panels generally do not.** |
| **SAX2V1R** | Sercomm **IP6442B**; FCC **P27IP6442B**; Spectrum SAX2V1R; Wi‑Fi 6E (PHY up to 4803.9 Mbps); 12 V. Cousin SAX1V1K = Askey IPQ8072A + 2 GB + OpenWrt — **different SoC, do not assume 2 GB** | Spectrum Linux | **2–6 hyp** | **Partial** — dual U-Boot slots on Askey cousins; dump eMMC before flash; stock Spectrum image hard to re-fetch (ISP). Dump first. | UART |
| **TU7000** | 2020 Crystal UHD; **Crystal Processor 4K** (4 cores advertised); Tizen 5.5; Bishop Fox path demoed on **UN43TU700D** | Tizen | **1–4 hyp** | **Yes** — Samsung USB firmware / SmartThings / factory reset; Tizen recovery documented | SDB |
| **E472VLE** | VIA 2012 | Yahoo widgets | **0.2–1 hyp** | **Weak** — USB `MERGE.bin`-style updates for some Vizio; 2012 VIA images scarce. Dump NAND/SPI before write. | UART |
| **EN2251** | Hitron **EN2251-RES** DOCSIS 3.1 **modem** (not gateway): 1×2.5GbE + voice; Intel **Puma 7** dual-core Atom + ARM MAC; 12 V 2 A, max **16.93 W**. Atom MHz/RAM **not** in public datasheet (many Puma 7 modem boards ~1.2 GHz / <1 GB — 2–2.5 GHz is a high-end guess) | Spectrum | **4–10 hyp** (0 if RAM gate) | **Weak** — ISP config push; full stock ROM not user-hosted. Dump eMMC. | UART |
| **K243Y** | Acer FHD scaler MCU | OSD | **0 hyp** | Factory scaler dump only | UART silk |
| **IMW1202** | HydraJolt 2.0 BT speaker; BT audio MCU | RTOS | **0 hyp** | Vendor OTA / SPI dump | CE practice |
| **CKS5TW** | **ATH-CKS5TW** TWS; FCC **JFZCKS5TWR/L**; BT 5.0 aptX/AAC; Qualcomm audio path (aptX/cVc) | proprietary | **0 hyp** | Charging-case DFU / vendor app; dump each bud + case | CE practice pair |
| **J3B** | FCC **V3J-J3B** (Aliph Jawbone BT VoIP dongle family) **or** label **V3J-J3B** — confirm silk. Closest public: Jawbone BT dongle (2011) CSR-class. If generic J3 headset (2BD43-J3): cheap TWS, JieLi/JL or similar | proprietary | **0 hyp** | Case DFU / chip-off | CE practice pair |

---

## Public root / unlock landscape (cursory, 2026-08-29)

| id / cousin | public status | venue / notes |
|---|---|---|
| **SAX1V1K** (cousin of SAX2) | **Yes — OpenWrt official** | UART; stock root login = serial# CAPS; MeisterLone / Lanchon U-Boot scripts; ToH IPQ8072A. **Not DEF CON** — OpenWrt forum + git. |
| **SAX2V1R** (this unit, Sercomm IP6442B) | **Partial cousin work** | OpenWrt SAX1 thread: SAX1V1R has UART, eMMC CLK glitch → U-Boot, fallback single-user; **no** published OpenWrt image for SAX2. Different SoC than V1K. |
| **EN2251** (Puma 7 Atom) | **Family rooted, not this SKU** | **DEF CON 25 CableTap** (Bastille): RDK / Puma Atom+ARM root chains (Arris/Cisco/Technicolor/Motorola). **DEF CON 30 IoT Village** Rapid7: Arris SB6190 eMMC → SSH root. Hitron CGNM-2250 (Puma 6 cousin): button → `nonpcpu` serial/telnet root. EN2251-specific writeup: **not found**. |
| **TU7000** (Tizen 5.5) | **Yes (dev mode)** | Bishop Fox SDB package-name injection → OS cmds; **demoed on UN43TU700D** (same TU7000 line). Newer public Samsung roots (QN90B/F Magisk-class / Mali) are different gens. SamyGO history. |
| **55QD65NF** Fire MT9602 | **ADB only for this SKU** | No public Magisk/unlock for Fire OEM QD6. Cousins: Hisense **U8N MT9618** Google TV XDA Magisk (UART+fastboot); old Exploitee.rs Hisense Android eMMC; VIDAA MT9602 service UART in Hisense manuals — not Fire. Fire **Stick/Cube** (not panel) heavily rooted on XDA. |
| **E472VLE** (2012 VIA Yahoo) | **Era rooted; SKU sparse** | Old Vizio/MTK UART service-jack + cmd inject (XDA); later SmartCast = Exploitee.rs / L9 RCE (newer). Google TV Co-Star / Hisense Pulse: early ADB-root (DEF CON-adjacent Google TV talks). Exact E472VLE: **no** modern guide. |
| **K243Y** scaler | **No** | Monitor OSD MCU — not a public root scene. |
| **IMW1202 / CKS5TW / J3B** | **No named roots** | Generic BT audio MCU / Qualcomm aptX / Jawbone-CSR class practice only. No DEF CON SKU writeups found. |
| **pixel8 / note9** | **Yes** | Mainstream (KernelSU / Magisk). |

**DEF CON takeaway:** cable/Puma path is the conference-hardened one (CableTap, IoT Village). Spectrum Wi-Fi = OpenWrt community. Tizen TU7000 = published SDB break. Fire OEM panel ≠ Fire Stick scene.

---

## Theorized best entry (public interfaces first)

Own gear only. Theory, not a recipe — no payloads. Prefer interfaces a normal owner already has: LAN, Wi‑Fi, BT, USB, vendor app, ADB/SDB, IR. UART/eMMC is fallback after public path fails or for dump-before-flash.

| id | best public surface | probable play | then |
|---|---|---|---|
| **SAX2V1R** | LAN web / Spectrum app / Wi‑Fi management SSID; WPS if on | Fingerprint Sercomm CGI / warehouse-style hidden pages (SAX1 cousins had hard-coded warehouse creds). Abuse ISP app pairing or local API. If stock already drops a root UART login after boot (cousin did), public path may be **none** — skip to UART. Soft: DHCP/hostname tricks rarely help on locked Spectrum builds. | Confirm SoC via FCC OpDesc; UART; if login shell exists → dump → OpenWrt port. Else eMMC CLK glitch → U-Boot (cousin SAX1V1R). |
| **EN2251** | `192.168.100.1` modem UI; LAN; SNMP/DOCSIS CM (**no Wi‑Fi** — Hitron RES is modem+voice) | Classic Puma/RDK: scrape UI for tech pages, password-of-the-day / hard-coded SSH (`arris`-class cousins), enable telnet/SSH from “support” CGI. CableTap-class: once on LAN as admin, hunt sysevent/DBus/UPnP for root cmd. Prefer **Atom (APP CPU)** — that’s the worker. Read RAM before assuming 0.5B fits. | If UI locked by Spectrum: front-button / factory boot tricks (Hitron Puma cousin `nonpcpu`); then UART or eMMC reflash like DC30 Arris lab. Dump before write. |
| **TU7000** | Samsung **developer mode** + **SDB** from a PC on LAN; SmartThings / DIY apps | Enable dev mode on TV (Apps → Settings → Developer → host IP). From that host: SDB install with malicious package **name** (Bishop Fox injection) → OS command as sdk → escalate per public writeups. Avoid random web RCE; SDB is the documented public interface. | Optional: older SamyGO USB/service if firmware old enough; else stay on volatile root / sideload. |
| **QD65NF** | Fire TV **ADB** (dev options), sideload APKs, USB | Already the public door. For worker: Termux/userland llama first — no root required for weak 0.5B. For root: hunt FireOS build vs Stick/Cube temp-root (likely **won’t** match OEM panel). Next public: malicious/debuggable system app abuse, Amazon package update sideload, or local privilege bugs — low odds vs Stick scene. | Only then UART / eMMC (Hisense MT9602 service notes are mostly VIDAA, not Fire). |
| **E472VLE** | Ethernet/Wi‑Fi if present; Yahoo widget “apps”; USB; IR service codes | 2012 stack: scan LAN for open HTTP/debug; widget/URL handlers often ran shell-adjacent. USB firmware / `MERGE.bin`-style update with unsigned or weakly signed image (era was soft). Hidden-network / service-menu command inject on later Vizios is a **cousin** pattern — try service remote codes first. | UART on mainboard if network dead; assume scarce stock ROM → dump SPI/NAND first. |
| **K243Y** | **HDMI DDC/CI**; OSD buttons; any USB-C/service USB; factory IR if supported | Scalers sometimes expose DDC/CI vendor commands or I²C tunnels for firmware update. Public “interface” = PC with DDC tool / Monitor Asset Manager–class utilities, or vendor .bin over USB if Acer ships one. Exploit = malformed update or DDC write to flash if no sig check. | Silk UART next to scaler; bus pirate dump. Worker value near zero — practice only. |
| **IMW1202** | Classic **Bluetooth** (A2DP/AVRCP/GATT); charge micro‑USB | Pair as speaker; enumerate GATT/RFCOMM. Look for vendor OTA characteristic or serial-over-BT used by “Altec” app. Unsigned OTA or path traversal in update = usual CE win. USB mass-storage / CDC if the charge port enumerates anything beyond charge. | SPI flash clip if BT OTA signed. Practice, not tok/s. |
| **CKS5TW** | BT LE + classic; **charging case** USB; phone companion app | Case is often the DFU master: plug case USB → look for DFU/HID/Audio class. App OTA to case then buds. Qualcomm audio path → QACT/DFU-style interfaces on cousins. Best public bet: **case USB DFU** or app-captured OTA blob replay with patched image. | Dump buds + case separately; don’t brick both. |
| **J3B** | BT and/or USB if it’s the Jawbone **dongle** form | If USB dongle: enumerate as sound card/HID — CSR/BlueCore cousins historically had DFU over USB. If headset: same as CKS5TW (case DFU + BT OTA). Confirm silk before assuming Jawbone vs generic JieLi TWS (JieLi has public flash tools). | Chip-off last. |

**Skip (already accessible):** qodesh, shalom, godslove, pixel8, note9.

**Order to try (public-first):** TU7000 SDB → QD65NF ADB userland → EN2251 `192.168.100.1` → SAX2 LAN/app fingerprint → E472 service/USB era tricks → BT CE toys (IMW/CKS/J3B) → K243Y DDC.

---

## Secondary controllers (powerful misses)

| host | secondary | worker? |
|---|---|---|
| **EN2251** | Puma **dual Atom** (MHz unpublished) | **Yes if shelled and RAM ≥1 GB** |
| **SAX/IPQ807x** | **2× NSS** packet cores | Offload Wi-Fi → A53 free for 0.5B — **SAX1 cousin only** until SAX2 silk |
| **pixel8** | EdgeTPU | TFLite sidecar |
| **pixel8** | Titan M2 / modem | No GGUF |
| **shalom** | 610M 2 CU RDNA2 | **4B/7B**, not 0.5B (CPU wins 0.5B gen) |
| **qodesh** | 8600 GT sm_1.1 | **CUDA 6.5 back-compat** for small models (see GPU note); Vulkan dead |
| **QD65NF** | Mali-G52 + T-Con | GLES maybe |
| Storage | SSD R5/R8; **DVD/BD** drive MCU (MediaTek/ESS/Realtek — well-hacked firmware scene) | Stream/ripping DSP; not GGUF. DVD = practice + maybe stream decode assist |
| **CKS5TW / J3B / IMW1202** | BT audio SoC | CE exploit practice only |

**DVD/BD drives:** firmware (MTK/Realtek/ESS) is a known hacker target (region-free, RPC). Treat like SSD secondary: programmable MCU, **not** a tok/s worker. Add physical drive model when you name one.

---

## Facts this pass (shalom, 2026-08-29)

- **shalom** inventoried: 7520U 4C/8T @ 2.8 GHz base; 16 363 286 528 B RAM; AMD Radeon Graphics driver 32.0.21045.5002; Win11 Home 10.0.26200.
- llama-bench build **10665** `tg8` / `pp32` on the 0.5B Q4: CPU ngl0 **tg 48.12±1.93**, pp 77; Vulkan ngl99 **tg 8.36±0.11**, pp 112. Backend reports `matrix cores: none`, UMA.
- **EN2251** = Hitron EN2251-RES (modem+voice, not Wi-Fi gateway). Puma 7 dual-core Atom confirmed by Hitron/Intel 2015 CODA launch copy. Clock/RAM still unpublished.
- **55QD65NF** SoC MT9602: 4×A53 @ 1.5 GHz, Mali-G52 2EE MC1, **max 2 GB** 48-bit DDR3 (MediaTek). 55" rated 125 W.
- **SAX2V1R** FCC P27IP6442B / Sercomm IP6442B / 12 V / Wi-Fi 6E. OpenWrt has **SAX1V1K only** (IPQ8072A + 2 GB). Do not copy those specs onto SAX2.
- Live GRZ on shalom still **degraded** (7B/4B impractical vs current free RAM); nexus :8187 resident.

**Still confirm on the box:** J3B Jawbone vs JieLi; SAX2 SoC from FCC internals / UART; EN2251 Atom MHz + `free`; TU7000 exact size + RAM; QD65NF populated RAM vs 2 GB cap; pixel8 Termux 0.5B meas. **note9 SKU done** (SM-N960U SDM845).

---

## Qodesh test status (2026-08-29 snapshot)

| gate | status |
|---|---|
| Unit tests (routing/gateway/nexus/proxy/logical) | **pass** (focused) |
| Full suite | last local-ci snapshot: suite ran (fuzz **9/9** present in `local-ci-last.txt`); loop process **dead** after start line only |
| Serve live | resident **8187** + gateway **:8080** (often `degraded`) |
| Direct 8187 8-tok | **3.0 tok/s meas** (2026-08-29) |
| `/code` via gateway | still needs live re-verify |
| Local CI loop | **`scripts/local-ci-window.cmd`** detached, every 5 min → `data/local-ci.log` |
| Visible console | `serve-window.cmd` / `local-ci-window.cmd` |
| Git | develop on **shalom**; both trees at `origin/main` |

---

## Shalom test status (this host)

| gate | status |
|---|---|
| Full suite | **191/191** pass (2026-08-29, routing slash/native/SSE) |
| Serve live | `:8080` degraded (4B/7B RAM); nexus `:8187` 0.5B CPU-2-thread resident |
| 0.5B worker meas | **48 tok/s** CPU ngl0 tg8; Vulkan tg8 **8.4** (do not use 610M for 0.5B) |
| 4B / 7B | impractical right now (RAM: ~3 GB free + 2 GiB headroom) |
| Git | `C:\Users\brian\Documents\green-roomz` = canonical |

---

## Note 9 test status (USB on shalom, 2026-08-29)

| gate | status |
|---|---|
| ADB | `27841130ae1c7ece device` SM-N960U, **no root** |
| CPU pack | llama.cpp 0.3.0 NDK 29 arm64; backends next to bin |
| llama-bench 4t | **pp64 36.8** / **tg32 23.8** on 0.5B Q4 |
| Termux Node | **v26.4.0**; GRZ in `~/green-roomz`; runtime in `~/grz-runtime` |
| Gateway | **listening** `127.0.0.1:8080`; `adb forward tcp:18080 tcp:8080` |
| tool-router-agent | **ready** resident; chat 200 ~4.5 s via forward |
| Specialists | unavailable (no extra GGUFs) |
| Do not | execute ELF from `/data/local/tmp` as Termux (SELinux); do not Magisk |
| Handoff | `docs/note9-termux.md` |

---

## Phone pack (pre-build on shalom; do not push yet)

Reuse existing Android cross-build, do not invent a third SDK:

| piece | already on shalom | use for phones |
|---|---|---|
| SDK / adb | Japanglify `ANDROID_HOME=C:\Android\Sdk` (`bootstrap-android-sdk.sh`, Pixel 8 DUT) | licenses, platform-tools, `adb` |
| Native pin | `llama.cpp-0.3.0/examples/llama.android` **NDK 29.0.13113456**, **CMake 3.31.6**, KleidiAI + `GGML_CPU_ALL_VARIANTS` | same NDK/CMake into that SDK |
| llama.cpp source | `C:\LocalAI\llama.cpp-0.3.0` | CLI `llama-server` / `cli` / `bench` |
| 0.5B Q4 | `C:\LocalAI\Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` (432 MiB) | copy last, with the ELF |
| Gateway | this repo, Node, no native addon | Termux `nodejs`; `--manifest config/agents.android.json` |

**Yes, CPU pack can be built entirely on shalom.** One **arm64-v8a** ELF: `ANDROID_PLATFORM=android-28` (Note 9), `ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON` (Pixel 8 16K). `scripts/android-cross-build.ps1` is **CPU-only today** (`GGML_VULKAN` / `GGML_OPENCL` off). KleidiAI + `GGML_CPU_ALL_VARIANTS` is the shared CPU path, not a GPU path.

**GPU is not accommodated yet.** `GGML_BACKEND_DL=ON` is there so a later `ggml-vulkan.so` / `ggml-opencl.so` can load beside the same `llama-server`, but those .so files are not built. Pick the backend from the live SoC — not a guess:

| phone | GPU if this SKU | llama.cpp backend to add |
|---|---|---|
| **note9 SM-N960U** | **Adreno 630** (live GLES: Qualcomm, OpenGL ES 3.2) | **OpenCL first** (llama.cpp Snapdragon recipe) and/or Vulkan. Not Mali. Hexagon HTP packs target newer SoCs — do not assume SDM845 DSP. |
| **pixel8** Tensor G3 | Mali-G715 | Vulkan + KleidiAI CPU |

Until `adb` can `getprop ro.hardware` / `dumpsys SurfaceFlinger`, do not turn on OpenCL (needs Khronos ICD in the NDK sysroot) or Vulkan (needs glslc + Android loader). Hexagon is Snapdragon-only and not for this Note 9 until the SKU is SDM.

**Note 9 USB (shalom, 2026-08-29):** first lead was charge-only (no ADB). Data cable + Allow RSA → `27841130ae1c7ece` **SM-N960U** / SDM845 / Adreno 630 / Android 10 / 5.7 GB. Host key `brian@SHALOM` (`.android\adbkey` 2026-08-19).

**Not in this pack yet:** GPU backends; llama.android **APK** (`minSdk 33` → Pixel 8 only, Note 9 is API 28); native sidecar (handshake stub only); 4B/7B GGUFs.

Scripts: `scripts/android-sdk-ndk.ps1` then `scripts/android-cross-build.ps1` → `C:\LocalAI\android-pack\arm64-v8a`. On device: `GRZ_ROOT=... node bin/green-roomz.mjs serve --manifest config/agents.android.json`.

**Gate — do not `adb push` / Termux copy until shalom *or* qodesh live agent is mostly working:**

- [x] suite **191/191** on shalom
- [x] live `/route`: `/vision` no-image **400**, `/tts` **400**, `/router` resident, `/code` slash_code, `/embed` slash_embed
- [x] live 8-tok via `:8080` lock_alias nexus **200** in 1.7s
- [x] live `/code` with impractical 7B → **resident_fallback** 200 in 3.4s, not 503
- [x] NDK 29 + CMake 3.31.6 installed into Japanglify SDK
- [x] `android-cross-build.ps1` → `C:\LocalAI\android-pack\arm64-v8a` **elf64 aarch64** `llama-server`/`cli`/`bench` + CPU KleidiAI `.so` variants (UI stub; cmake install of unused batched-bench skipped; copy bin/lib by hand)
- [x] note9 ADB — **SM-N960U SDM845 Adreno 630** (was charge-only cable + RSA Allow)

SKU confirmed: **Snapdragon, not Exynos.** GPU pack = OpenCL/Vulkan, not Mali.

---

## qodesh GPU — original intent (CUDA 6.5 back-compat)

**Goal (do not drop):** take **existing small** models and run them on the **8600 GT** by **building llama.cpp / GGML backward-compatible with CUDA 6.5 / compute sm_1.1** — not by hoping modern Vulkan sees the card.

**Facts today:**
- Card: **GeForce 8600 GT**, ~224-256 MB VRAM, sm_1.1, driver `9.18.13.4192`
- Modern pack: `llama-server --list-devices` -> **`(none)`** (Vulkan path is dead on this GPU)
- Installer on shalom/LAN: `cuda_6.5.19_windows_general_64.exe` (md5 `63575eee...`); **do not casually run** on Win11 (driver risk) — see known-bugs / handoff
- Toolchain for that era: **VS2013 + CUDA 6.5 nvcc** (not VS2022 as a fake). CMake/Ninja/Python as build hosts only
- **0.5B Q4 file is 432 MiB** -> cannot **fully** reside in 224 MB VRAM; plan was always **partial offload / tiny `n-gpu-layers` + CPU mmap**, not "whole model in VRAM"

| Track | Status |
|---|---|
| **Interim live GRZ** | CPU `--device none` (meas **3.0 tok/s**). `vulkan-all` / `hybrid-12` are **shalom** profiles — must not win on qodesh until a CUDA-1.1 build exists |
| **Target GPU path** | Build GGML CUDA backend for **sm_1.1 / CUDA 6.5**; use **existing small** GGUFs (0.5B Q4 and smaller), offload what fits in 224 MB |
| **Not the plan** | New giant models; stock Vulkan b10665 on this card; light driver replacement |

**Models for the GPU (when the back-compat binary exists):** same small artifacts we already have — start with **0.5B Q4** (and tinier drafts if any). Do **not** invent a new model family for the 8600.

**Partition:** display on 8600; LLM = CPU **today**; GPU returns when **our** CUDA 6.5 build lights up devices, not when Vulkan does.

### Ship commitment - what the 8600 will do

**Useful enough to ship the GPU story:** run **most of the security-monitor path on the 8600 GT** (CUDA 6.5 / sm_1.1). That alone counts. If we cannot do that, we failed the easy engineering proof.

| Piece | Spec |
|---|---|
| Binary | Our CUDA **6.5 / compute_11** build (VS2013 + staged toolkit; careful Win11 driver story) |
| Work | Majority of monitor/mailbox hot path on GPU: copy-engine or host-memcpy slot (**F3/F21**), seq `{hi,lo}`, push/drain assist, payload hash / ring scrub — **GPU MUST NOT list** (private slot, not a model roster) |
| Useful = | Under load, most monitor ops hit the 8600; CPU fallback still correct if GPU absent |

**Live proof (qodesh):** GeForce 8600 GT **sm_11** copy + FNV via `native/sm11-monitor` (`copy_ok=1 hash_ok=1`). Probe only — not yet wired into the JS mailbox/monitor path. Issue: https://github.com/brianreborn/green-roomz/issues/13

**Optional later (not required to call the GPU useful):** partial 0.5B Q4 `n-gpu-layers` offload on the same toolchain. Nice if tok/s >= CPU-only; not the usefulness bar.

**Non-goals on 224 MB:** whole chat models in VRAM; Vulkan lighting up; vision/whisper/sd on this card.

**Order:** CPU nexus stays live -> CUDA 6.5 toolchain -> **monitor-on-8600** -> (optional) 0.5B partial offload.

## Block layouts (all considered)

Shared GRZ ports if a box ever hosts the gateway: `:8080` Node · `:8187` 0.5B resident · cold `:8183` code · `:8184` text · `:8181` vision.

### SAX2V1R — Sercomm IP6442B · Spectrum Linux · no shell

```
+---------------- eMMC (size unknown; dump first) ----------------+
|  U-Boot (dual slots on cousins; SAX2 unconfirmed)               |
|  Spectrum rootfs  (app-locked; warehouse CGI cousins only)      |
|  [AP CPU] A53-class?  -- worker IF freed AND ≥1 GB DRAM         |
|  [NSS / Wi-Fi 6E] packet offload -- not GGUF                    |
|  UART  (cousin SAX1V1R: GND TX 3.3 RX; CLK-glitch → U-Boot)     |
+---------------- 12 V  ·  ≠ SAX1 IPQ8072A 2 GB ------------------+
  GRZ: none until UART. Do not flash SAX1 images.
```

### EN2251 — Hitron EN2251-RES · Puma 7 · modem (not gateway)

```
+---------------- eMMC  (dump before write) ----------------------+
|  [APP CPU] dual Atom  -- the worker IF ≥1 GB free               |
|  [NP / MAC] ARM DOCSIS  -- not GGUF                             |
|  Voice DSP / 2.5GbE  -- leave alone                             |
|  Public door: 192.168.100.1  (ISP may lock)                     |
|  Cousin: button-hold nonpcpu serial/telnet (Puma 6 Hitron)      |
+---------------- 12 V 2 A  max 16.93 W --------------------------+
  GRZ: none. RAM gate — many Puma 7 modem boards <1 GB → tok/s=0.
```

### TU7000 — Crystal Processor 4K · Tizen 5.5

```
+---------------- eMMC / Tizen partitions ------------------------+
|  Tizen 5.5  (keep TV apps)                                      |
|  [ARM 4c] Crystal 4K  -- 0.5B only if SDB root + RAM enough     |
|  Display pipeline  -- panel watts dominate J/tok                |
|  Public door: developer mode + SDB (Bishop Fox on TU700D)       |
|  Reset: Samsung USB firmware / factory                          |
+-----------------------------------------------------------------+
  GRZ: none yet. Worker beside Tizen, not instead of.
```

### E472VLE — VIA 2012 · Yahoo widgets

```
+---------------- NAND/SPI  (scarce stock ROM — dump first) ------+
|  2012 VIA SoC + Yahoo widget runtime                            |
|  USB MERGE.bin-style updates on some Vizios                     |
|  UART / IR service  -- era cmd-inject cousins, not this SKU     |
+-----------------------------------------------------------------+
  GRZ: none. 0.5B marginal (0.2–1 hyp).
```

### QD65NF — 55QD65NF · MT9602 · Fire TV · ≤2 GB

```
+---------------- SoC DRAM ≤ 2 GB --------------------------------+
|  Fire OS  (keep)                                                |
|  ADB / unknown sources  -- Termux 0.5B TIGHT after OS           |
|  Mali-G52  -- GLES maybe later                                  |
|  T-Con / panel 125 W  -- not a worker                           |
+-----------------------------------------------------------------+
  GRZ: ADB userland only. No Magisk for this Fire OEM SKU.
```

### K243Y — Acer FHD scaler MCU

```
+---------------- scaler SRAM/flash ------------------------------+
|  OSD MCU  -- HDMI DDC/CI / factory UART silk                    |
|  no Linux, no mmap, no GGUF                                     |
+-----------------------------------------------------------------+
  GRZ: none. CE practice / 0 tok/s.
```

### IMW1202 — HydraJolt BT speaker

```
+---------------- BT audio MCU + SPI -----------------------------+
|  A2DP/AVRCP/GATT  · charge USB                                  |
|  OTA characteristic / companion app  -- CE practice             |
+-----------------------------------------------------------------+
  GRZ: none.
```

### CKS5TW — ATH-CKS5TW TWS · FCC JFZCKS5TWR · aptX

```
+-- bud SoC --+ +-- bud SoC --+ +------ case DFU / USB ------+
|  aptX/cVc   | |  aptX/cVc   | |  DFU master; dump all three |
+-------------+ +-------------+ +----------------------------+
  GRZ: none. Qualcomm audio path practice only.
```

### J3B — FCC V3J-J3B (confirm silk: Jawbone dongle vs JieLi TWS)

```
+---------------- BT / USB DFU -----------------------------------+
|  If Jawbone dongle: CSR-class USB DFU                           |
|  If generic J3 TWS: JieLi flash tools                           |
+-----------------------------------------------------------------+
  GRZ: none.
```

### Storage secondaries (named when present)

```
SSD FTL MCU     -- not tok/s
DVD/BD (MTK/ESS/Realtek)  -- firmware practice; stream DSP maybe
```

---

## Next

1. Finish shalom live agent gate (`curl.exe` `/route` + 8-tok) **before** any phone copy  
2. Finish NDK/CMake install + `android-cross-build.ps1` on shalom  
3. Then note9 Termux 0.5B — CPU pack first, **OpenCL/Vulkan Adreno 630** as the GPU add-on (not Mali)  
4. SAX2V1R FCC internals / UART silk; dump before flash — **do not** flash SAX1 images  
5. EN2251 `192.168.100.1` fingerprint only; read RAM before believing 4–10 tok/s  
6. TU7000 SDB if developer mode OK  
7. Keep qodesh `local-ci-window.cmd` alive  

New device → row + all three charts + **reset** + RAM/class. Update charts on every new `meas`.

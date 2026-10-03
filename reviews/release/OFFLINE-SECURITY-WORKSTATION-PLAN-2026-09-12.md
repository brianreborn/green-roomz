# Offline Security Workstation — absolute-top-priority release plan — 2026-09-12

**Audience:** operator Brian  
**Priority:** **NEW absolute top** — supersedes note9-as-ship-artifact framing for the *release cut*; note9 remains a **client/target** (see `GOAL-PIVOT-2026-09-12.md`).  
**Ship artifact:** a **security-enhanced Linux *or* BSD image/kit** carrying **Green-Roomz**, **green-agentz seams**, a **defensive security analysis/testing suite**, and a **full offline model pack** sized for fleet machines — usable **airgap / anywhere** on a **moderately powerful** host.  
**Hard rules (inherited):** defensive security only · no exploits/PoCs · no plaintext creds · **no `git push` unless operator asks** · dual-team path ownership · do not invent SHAs or tweet bodies.

**Synthesized from (existing boards only):**
- `/workspace/reviews/release/PLANNING-PACKAGE-2026-09-12.md`
- `/workspace/reviews/release/note9-release-plan-2026-09-12.md`
- `/workspace/reviews/release/ongoing-dev-efforts-2026-09-12.md`
- `/workspace/reviews/fuzz-review.md` (+ harness under `/workspace/_scratch/fuzz/`)
- `/workspace/reviews/boundary/BOARD.md`
- `/workspace/reviews/covert-channel-fix-pack.md`
- `/workspace/reviews/x-archive-2022-themes.md` (theme counts; FreeBSD/security density)
- `/workspace/session/known-bugs.md` (dispatch / routing “wonky” lineage)
- Memory/fleet facts: hosts qodesh / shalom / godslove / note9 / pixel8; new ISP enables tunnel punch-through **design**; dual SuperGrok teams; other Researcher `09f2d365…`

---

## 1. Executive goal + success criteria

### Goal

Cut a **take-anywhere offline workstation release**: one bootable / installable **Linux or BSD** base, hardened for operator defensive work, with:

1. **Green-Roomz** gateway + security-monitor mailbox / slash / watchdog (tip lineage `main@eb4a9f7` / security slash `9889493`) runnable **without cloud**.
2. **green-agentz** consumable **by reference** (`GREEN_BRAINZ_ROOT`, Roomz #10 / Agentz #3) — zkillz alpha pack install-by-path, **no vendor-copy**.
3. A **full suite of security analysis/testing tools** already evidenced in-repo or on box boards (fuzz harnesses, boundary/covert defensive inventories, monitor reject stubs, peer allowlist design) — plus category placeholders for static analysis / defensive network monitors that ship with the image.
4. **Model packs for all fleet machine classes** (phone-resident tiny → laptop/desktop mid → workstation large), offline-complete (no fetch at use time). `fetch-models.mjs` (`eb4a9f7`) is the *build-time* filler, not a runtime dependency.
5. **Rapid iteration** to clear remaining **major Green-Roomz dispatch-wonky bugs** as a **P0 freeze gate** before imaging.

### Success criteria (airgap-capable kit)

| # | Criterion | Evidence gate |
|---|-----------|---------------|
| S1 | Image boots on target class (moderately powerful x86_64; exact SKU TBD — open Q) without network | Offline UAT checklist pass |
| S2 | Green-Roomz `serve` → `/health` 200; security slash/watchdog reachable; lockdown/reboot **reject** (never false-success) | Localhost UAT; cite monitor docs + fuzz OK rows |
| S3 | Major dispatch-wonky P0/P1 class closed or explicitly deferred with operator sign-off | §5 gate table green |
| S4 | Model pack present on medium (USB/ISO/internal volume): all sizes needed for fleet hosts | MODEL-PACK inventory (may land separately) + checksums |
| S5 | Agentz seam: Brainz/zkillz install-by-path works offline when pack present; else documented skip | Roomz #10 / Agentz #3 |
| S6 | Defensive tool suite categories installed and smokeable offline | §3 bill |
| S7 | No WAN exposure required; peer/tunnel remains **design-only** until allowlist+key UAT | deployment.md / note9 plan §4.3 posture |
| S8 | Dual-team ownership respected; no push race | §6 |

**Non-goals for this cut:** Magisk/root phone jailbreaks; offensive tunnel bypass recipes; merging `wip/council-*` during freeze unless operator asks; inventing tweet bodies; creating `green-fleetz` repo (Agentz #6).

---

## 2. OS base options comparison (history-grounded)

Mark: **[E]** = evidence in boards/repos · **[S]** = speculation / operator choice still open.

| Option | Fit for offline security kit | Operator-history grounding | Risks / gaps | Verdict for this plan |
|--------|------------------------------|----------------------------|--------------|------------------------|
| **FreeBSD 15 / PQFreeBSD** | Strong Capsicum/MAC story alignment for trust-boundary work; jail-friendly offline workstation | **[E]** Roomz issue **#5** host/godslove = FreeBSD 15 (PQFreeBSD), i7-620M; `docs/fleet-targets.md` names PQFreeBSD 15; monitor docs cite “Future sites (… PQFreeBSD MAC)”; repos `brianreborn/pqfreebsd` tip `449635c`, `pqfreebsd_kernel` `b329201`, `freebsd-mac-grok` `253a385` (issue/docs link — **no shared git history** with Roomz). **[E]** 2022 archive: FreeBSD **45** hits, security **41**, trust **96** (`x-archive-2022-themes.md`). | Roomz still needs `freebsd.mjs` / `agents.freebsd.json` (#5 unchecked). Godslove not registered. pqfreebsd is inventory/workbench status, not a proven Roomz host image. | **Primary BSD candidate** if operator wants continuity with godslove + papers/OS identity. |
| **HardenedBSD** | Hardened defaults attractive for airgap analyst kit | **[S]** No HardenedBSD string hits in current `/workspace/reviews/*` boards or efforts catalog this pass. Do **not** claim prior board endorsement. | Extra delta atop FreeBSD; may slow green-roomz Node/llama bring-up if ports lag. | **Optional fork of FreeBSD path** — only if operator explicitly picks it. |
| **Debian (hardened / CIS-ish)** | Broadest package coverage for analysis tools; easiest Node + llama.cpp + USB live image story | **[S]** No Debian pin in Roomz issues. **[E]** Adjacent: 2022 archive RT endorsing “bsd or linux based” security posture (id cited in themes board under security theme); Linux mentioned as peer Unix in FreeBSD threads. Fleet today is mostly **Windows** (qodesh/shalom) + **Android Termux** (note9) + FreeBSD target (godslove). | Less “operator OS identity” than FreeBSD; need explicit harden profile (sysctl, firewall default-deny, no plaintext creds). | **Primary Linux candidate** for fastest tool-suite + model-pack logistics. |
| **Ubuntu LTS (minimal + harden)** | Similar to Debian; Snap/cloud agents must be stripped for airgap | **[S]** No Ubuntu-specific board pin. | Snap/cloud pull habits fight airgap; extra demotion work. | Acceptable if operator prefers Ubuntu familiarity; treat as Debian-class. |
| **Status quo Windows (qodesh/shalom)** | Already runs Roomz tip / fuzz / Unicorn | **[E]** qodesh machineId `19f2c19e-…`; main tip Windows MVP `0336d76`; fuzz live on qodesh. | Not the *new* ship artifact; Athlon/8600 GT constraints (never GGUF on 8600 GT). Remains **build/dogfood** host, not the offline image brand. | **Build host / integrator**, not the released OS image. |
| **Android Termux (note9)** | Client/target only under pivot | **[E]** Issue #2; `docs/note9-termux.md`; resident 0.5B only. | Cannot carry full model suite or full analysis toolset. | **Client**, not image. |

**Decision rule:** Operator picks FreeBSD-line vs Linux-line (**open Q1**). Until pick lands, dual-track *documentation* only; **image freeze waits on OS pick + dispatch P0**.

---

## 3. Software bill (cite sources)

### 3.1 Green-Roomz (core)

| Component | Source / tip | Role on offline kit |
|-----------|--------------|---------------------|
| Gateway + registry + serve | `brianreborn/green-roomz` `main@eb4a9f7` | Local llama.cpp-first agent gateway |
| Security slash / wrong-tool handoffs / activity watchdog | commit subject `9889493` | Defensive operator surfaces |
| Security-monitor docs + `src/monitor/*` + policies | `docs/security-monitor-{component-map,requirements,audit}.md` on main | Sentinel / Council / Warden reject stubs |
| Peer allowlist | `87e91ad`; `docs/deployment.md` | LAN peer 403; **no world bind** without key |
| Fetch-models + moderation harness | `eb4a9f7`, `c529ce4` | **Build-time** pack fill |
| Host markers (stale) | `host/note9|godslove|pixel8@260db2a` (42 behind main); `host/qodesh@1d8bbb9` | Integrate from main; do not ship stale host tips |
| Issue #5 FreeBSD adapters | open | Needed if BSD image chosen |

### 3.2 green-agentz seams

| Component | Source | Role |
|-----------|--------|------|
| Agentz main / UAT gates | `1b8933e` | Companion integration tree |
| zkillz 0.1.0-alpha | tag `green-zkillz-v0.1.0-alpha` → `a564c10` | Skills pack install-by-path |
| Brainz CognitiveHost / dreamz nap | `cd78e4c`; Roomz import `1d8bbb9` | `GREEN_BRAINZ_ROOT` only (#10) |
| MFL phases | `60f3af5` | Vocabulary via import seam |
| etioz charter | PR #1 / `skill/etioz` | Awareness; ratification other-team |

### 3.3 Security analysis / testing suite (categories)

Defensive only. Cite what already exists; mark **[kit-add]** for packages expected on the image but not yet inventoried as a single meta-package on box.

| Category | What we already have (evidence) | Kit expectation |
|----------|----------------------------------|-----------------|
| **HTTP / gateway fuzz** | `/workspace/reviews/fuzz-review.md` — 137 live HTTP cases; harness `/workspace/_scratch/fuzz/qodesh-http-fuzz.mjs`; qodesh logs under `data\_fuzz\` | Ship harness + offline case corpus; re-run on image loopback |
| **Manifest / expand fuzz** | FUZZ-EXPAND-01/02; PATH-02 / BND-07 overlap | Include in pre-freeze gate |
| **Trust-boundary review** | `/workspace/reviews/boundary/BOARD.md` BND-01..10 | Fix-packs absorbed before freeze |
| **Covert / side-channel defense inventory** | `/workspace/reviews/covert-channel-fix-pack.md` (sanitize SSE, KV isolate sketches — defensive) | Ship docs + any landed sanitizer ports; no exploit recipes |
| **Monitor reject / uncallable stubs** | fuzz OK: `/lockdown` `/reboot` → 404; `secureReboot` reject envelope | Regression suite on image |
| **Static analysis** | **[kit-add]** — not a named meta-package on boards yet | Language-appropriate offline SAST (e.g. Node lint/typecheck, shellcheck, pkg audit) — pick per OS |
| **Network monitors (defensive)** | Peer allowlist + deployment bind rules; **[kit-add]** host firewall / IDS in default-deny | tcpdump/wireshark-class **observe-only**; no offensive punch scripts |
| **OS / package audit** | pqfreebsd inventory theme; **[kit-add]** `pkg audit` / Debian `debsecan`/`apt-listbugs` class | First-boot audit script offline-capable with cached DB |
| **Forensic read-only helpers** | Fleet heartbeat boards exist but are **out of ship product scope** (operator forensic agents) | Optional; do not entangle Twitch/X evidence into image |
| **Domain / unit tests** | Historical 75/75 at `d0b261b`; `node --test` on integrate tree | Must green before freeze |

### 3.4 Out of bill

- `green-agency` retired (`6a4e0d7`) — do not reopen.
- `green-fleetz` — do not create (Agentz #6).
- Offensive cyber / exploit PoCs — disallowed.

---

## 4. Model pack strategy

**Reference:** a detailed **MODEL-PACK inventory may land as a separate board** under `/workspace/reviews/release/` (or models/). This section is the **strategy**, not the byte inventory.

### 4.1 Size tiers (fleet-aligned)

| Tier | Typical host | Role | Evidence anchors |
|------|--------------|------|------------------|
| **T0 phone-resident** | note9 / pixel8 | tool-router ~0.5B Q4 only; specialists missing→503 | note9-termux.md; measured ~23.8 tok/s; RAM headroom 256 MiB |
| **T1 degraded desktop** | qodesh Athlon / weak GPU | CPU nexus + small text; **never GGUF on 8600 GT** | RELEASE-READINESS hard rule; issue #4 |
| **T2 laptop / mid** | shalom-class Vulkan | VL / coder / text mid-size Q4 | system-requirements + RETURN-WHEN-LAPTOP artifact lists |
| **T3 workstation / offline kit target** | “moderately powerful” image host (**open Q2**) | Full alias set: text, code, vision+mmproj, audio, embed, rerank, guard/moderation, optional image-gen, optional draft/EAGLE | `green-roomz-system-requirements.md` ten aliases; `c529ce4` harnesses |

### 4.2 Build vs run

- **Build (online once):** `scripts`/`fetch-models.mjs` + checksums + license/provenance files → write immutable pack tree.
- **Run (airgap):** Roomz validates artifacts; missing → **unavailable/503**, never silent wrong-tool fallthrough (dispatch P0).
- **Medium:** USB SSD and/or hybrid ISO with models on second partition (**open Q3**). Fake/tiny GGUFs (<10KB / HTML 404) are known failure mode (`known-bugs.md`) — pack verify must reject.

### 4.3 Separate deliverable

Track as `MODEL-PACK-INVENTORY-2026-09-12.md` (or dated) listing path, size, sha256, alias, tier, license. Do not invent hashes here.

---

## 5. Dispatch-bug rapid fix track — **P0 gate before image freeze**

“Dispatch-wonky” = routing / slash / model-alias / fallthrough / nexus plan≠completions behavior that makes security and specialist UX lie.

### 5.1 P0 / P1 backlog (from boards — do not invent new IDs)

| ID / theme | Sev | Source | Freeze rule |
|------------|-----|--------|-------------|
| Silent model/slash **fallthrough** to tool-router (tts/code/general-text wrong alias; historical draw/imagine — draw now OK 503) | **P1→P0 for kit** | `fuzz-review.md` FUZZ-FALLTHROUGH-*; Fuzz Tester lastEntry modality note | **Must** pin or 503 — no silent 200 on wrong tool |
| Security slash / wrong-tool handoffs / watchdog correctness | **P0** | `9889493`; monitor docs | Validate + localhost UAT |
| Vision-first hop / offlinePlan prettify (enum filter; final reason only) | **P0/P1** | `known-bugs.md`; RELEASE-READINESS “routing prettify not landed” | Land or explicit defer sign-off |
| Capability ∩ modality gates (BND-03/04); exact route allowlist (BND-01) | **P0** | `boundary/BOARD.md` | Absorb before freeze |
| Sanitizers / nexus allowlist port from grz-src (BND-02/06) | **P0** | boundary + grz-src | Port into integrate tree |
| `${GRZ_ROOT}` expand fail-closed (FUZZ-EXPAND-01 / BND-07) | **P1** | fuzz-review | Fail-closed required on kit |
| Null body hang (FUZZ-NULL-HANG) | **P1** | fuzz-review | Fast 400 |
| Unicode → 500 (FUZZ-UNICODE-500) | **P1** | fuzz-review | Sanitize / 400 |
| TTS Unix path on Windows (FUZZ-TTS-500) | **P1** | fuzz-review | Clean 503 on kit OS |
| Mailbox null throw (FUZZ-MAILBOX-NULL) | **P1** | fuzz-review | Reject envelope |
| Stream ESC / timings strip | **P1/P2** | covert fix-pack; known-bugs | Prefer land sanitizer path before freeze |

### 5.2 Rapid-fix loop

1. Single integrator on `src/gateway.mjs` / routing / nexus (collision rule).
2. Reproduce on localhost with fuzz harness subset.
3. Patch → `node --test` → fuzz delta → board append dated note.
4. **Image freeze blocked** until §5.1 P0 rows green (or operator-signed defer).

---

## 6. Dual-team work split (other Researcher `09f2d365…`)

| This team (active SuperGrok / box reviews — offline image + dispatch P0) | Other account Researcher `09f2d365…` (on wake / Windows·shalom) |
|--------------------------------------------------------------------------|------------------------------------------------------------------|
| Own **OFFLINE-SECURITY-WORKSTATION** plan + GOAL-PIVOT boards | Append dated addenda only; do not rewrite plans in-place |
| Dispatch P0/P1 integrate (gateway/routing/nexus/monitor) | Avoid simultaneous `src/gateway.mjs` edits |
| OS image recipe draft (post operator OS pick) | qodesh dirty-tree audit (Agentz #2); Windows Unicorn/fetch-models dogfood |
| Model-pack **strategy** + coordinate inventory board | May own large download/fill on shalom when online |
| Consume Agentz via `GREEN_BRAINZ_ROOT` | Agentz pack nits #11, Win zkillz runner #10, agency archive #4 |
| note9 as **client UAT target** (adb/USB) — not ship artifact | Stay off `agents.note9.json` / note9 scripts unless handed |
| Hold `wip/council-*` merge | Review/merge council #7/#8 **after** freeze unless asked |
| pqfreebsd/godslove awareness if BSD picked | Own godslove #5 bring-up when box exists |
| **No push** unless operator asks | Same |

**Collision rule:** one integrator for gateway/council/Brainz seam/`main` pushes; communicate via `/workspace/reviews/*`.

---

## 7. Phased milestones A–E

### Phase A — Dispatch bugs (P0 gate)

| Exit |
|------|
| §5.1 P0 rows fixed or operator-deferred in writing |
| Fuzz subset re-run: no silent fallthrough; monitor reject OK |
| `node --test` green on integrate tree |
| No push |

### Phase B — Pack (software + models)

| Exit |
|------|
| Roomz tip + Agentz seam pinned by **existing** SHAs only |
| Security tool categories installed in staging chroot/jail |
| MODEL-PACK inventory board landed (separate OK) with checksums |
| Fake GGUF rejection test |

### Phase C — Image

| Exit |
|------|
| Operator OS pick applied (FreeBSD-line vs Linux-line) |
| Reproducible image build (ISO and/or raw disk) + sbom/manifest |
| First-boot offline: Roomz validate + `/health` |
| Default-deny network; no plaintext creds in image |

### Phase D — Offline UAT

| Exit |
|------|
| Airgap (NIC down or firewall drop): full smoke S1–S7 |
| note9/pixel8 **client** optional: adb-forward against kit host |
| Fleet tier smoke: T0 subset + T3 full aliases |
| Peer/tunnel **not** required |

### Phase E — Ship

| Exit |
|------|
| Operator accepts medium (USB/ISO) + release notes |
| Dual-team sign-off on boards |
| Push only if operator explicitly asks |
| Living checklist updated |

---

## 8. Immediate 12 tasks

1. **Publish pivot:** land this plan + `GOAL-PIVOT-2026-09-12.md`; treat note9 plan as **client track**, not top ship artifact.  
2. **Operator OS pick:** FreeBSD/PQFreeBSD vs Debian-class (HardenedBSD only if explicitly chosen) — unblock Phase C.  
3. **Freeze gate board:** checklist mirroring §5.1 with owner + pass/fail.  
4. **Dispatch P0 sprint:** fallthrough→503/pin; BND-01/03/04; security slash UAT.  
5. **Sanitizer port:** grz-src → integrate tree; re-run domain tests.  
6. **Fuzz delta:** re-run `/workspace/_scratch/fuzz/qodesh-http-fuzz.mjs` (or image-local copy) after patches; attach summary to reviews.  
7. **MODEL-PACK inventory:** separate dated board — tiers T0–T3, aliases, sizes, sha256 TBD by measurement not invention.  
8. **Agentz offline seam:** document `GREEN_BRAINZ_ROOT` + zkillz zip layout on kit filesystem.  
9. **Tool-suite meta-list:** per-OS package names for SAST / pkg audit / defensive capture (observe-only).  
10. **Image skeleton:** choose medium (USB vs hybrid ISO — Q3); draft partition layout (OS | models | data).  
11. **Dual-team ping:** board note for `09f2d365…` — file locks on gateway; their ownership Windows/shalom/downloads.  
12. **note9 client path:** keep Issue #2 alive as UAT client only; USB Allow on qodesh remains operator action (forensic board claim unverified).

---

## 9. Open questions

1. **OS pick:** FreeBSD 15 / PQFreeBSD vs HardenedBSD vs Debian vs Ubuntu LTS for the **ship image**?  
2. **Target machine class:** exact “moderately powerful” SKU (CPU/RAM/GPU/disk) for T3 offline UAT?  
3. **Airgap medium:** bootable USB SSD, hybrid ISO+models partition, or both?  
4. **Build host:** build image on qodesh, shalom, or this box — given shalom offline (2026-09-11 heartbeat) and qodesh dirty tree?  
5. **Deferrals:** which §5.1 P1s may slip past freeze with written accept?  
6. **Tunnel:** any allowlisted peer CIDR for post-ship LAN UAT after new ISP, or kit stays loopback-only?  
7. **BSD adapters:** if FreeBSD image, is godslove #5 (`freebsd.mjs` / `agents.freebsd.json`) in-cut or follow-on?  
8. **Push policy:** still **no push** until operator dates a release tag?  
9. **Other Researcher wake window:** any forced unlock of note9/gateway paths?  
10. **MODEL-PACK board owner:** this team vs other team downloads?

---

## Document control

| Field | Value |
|-------|-------|
| Created | 2026-09-12 |
| Method | Consolidate existing box boards + operator pivot intent |
| Explicitly not used as fact | Invented tweet text; invented SHAs/hashes; HardenedBSD as prior endorsement; inverted host-ahead narrative |
| Companion | `/workspace/reviews/release/GOAL-PIVOT-2026-09-12.md` |
| Prior note9 plan (client track) | `/workspace/reviews/release/note9-release-plan-2026-09-12.md` |

---

## 10. Addendum — operator update 2026-09-12 (3 OS × Note9 VM)

**Do not treat §2 “Decision rule” / §9 Q1 as current.** Operator locked **all three** OS lines and elevated Note9 **VM** to a ship cell.

Full write-up (matrix, dual-team, USB+adb first-connect):  
→ **`/workspace/reviews/release/GOAL-UPDATE-3OS-NOTE9VM-2026-09-12.md`**

| Locked | Implication for this plan |
|--------|---------------------------|
| FreeBSD/pqfreebsd **+** Debian-class hardened Linux **+** HardenedBSD | Phase C is a **3-base matrix**, not pick-one; HardenedBSD in-cut |
| Note9 **VM** = ship target | Alongside workstation images; phone Termux stays client/Issue #2 |
| Knowledge library | Board landed: `KNOWLEDGE-LIBRARY-CANDIDATES-2026-09-12.md`; not this freeze gate |
| First connect | **USB+adb from qodesh**; note9 **not** in ListMachines (only qodesh/shalom) |

Prior sections remain valid for bills, dispatch P0, model-pack strategy, and hard rules — adjust OS-pick language via the GOAL-UPDATE, not a full rewrite.

### Knowledge-library track (landed 2026-09-12)

Curated compressed candidates (not a manpage dump):  
→ **`/workspace/reviews/release/KNOWLEDGE-LIBRARY-CANDIDATES-2026-09-12.md`**

- Always-on ≈12 compressed items (handbook extracts, HardenedBSD delta card, core RFCs, kit ops cards).  
- Full OS handbooks / manpages / release notes = **on-demand pointers only**.  
- Netadmin: recommend **`netadmin-rag`** (RAG over library via existing embed/rerank); specialist GGUF alias `netadmin-chat` filename **TBD**.  
- Targets: **all three OS lines + Note9 VM** (phone Termux remains T0 client).

# Note9-local Green-Roomz release plan — 2026-09-12

**Owner:** this SuperGrok team (note9 integrate + ship)  
**Machine context:** planning on shared box; canonical Windows tree on **qodesh** `machineId 19f2c19e-e100-49f0-8507-813d66727973` at `C:\Users\brian\Documents\green-roomz`  
**Origin:** https://github.com/brianreborn/green-roomz.git  
**Hard rules:** localhost-first tests · defensive security only (no exploits/PoCs) · **no `git push`** · **no reboot/lockdown** · do not invent tweet text · do not collide with idle other-account Researcher `09f2d365…`

Cross-refs already on box:
- `/workspace/reviews/release/RELEASE-READINESS.md` (earlier stand-up board)
- `/workspace/reviews/boundary/BOARD.md`
- `/workspace/reviews/platform/BOARD.md`
- Living checklist: `/workspace/reviews/release/note9-readiness-checklist.md`

---

## 1. Executive goal

Ship an **excellent note9-local Green-Roomz cut** on Samsung Galaxy Note 9 **SM-N960U** (Termux, no root) with:

1. **Real security capability** — security-monitor mailbox + slash/watchdog already on `main`, peer allowlist + tunnel design for new ISP, capability gates closed (Boundary BND-*), monitor stubs that **reject** (never false-success lockdown/reboot).
2. **Operator linguistics / compsci fold-in** — map `brianreborn/papers` (MFL, continuum-aerosol, cognitive-architecture/Dreamcatcher, fleet-bootstrap) onto Roomz surfaces (prompts, routing, locale, Brainz/MFL import, council) **by reference**, not vendor-copy (#10).
3. **Device reality** — only resident tool-router GGUF on phone; `~/grz-runtime` exec path; 256 MiB RAM headroom when `totalmem < 8 GiB`; specialists gated / missing-as-unavailable.

Success means: Issue **#2** checklist green on device, security workstream signed defensive-only, linguistics map landed as prompts/docs/import seams (not speculative science in gateway), dual-team file ownership respected, UAT on localhost/`adb forward` only.

---

## 2. Primary-source inventory

### 2.1 GitHub — green-roomz (facts by SHA)

| Ref | SHA (short) | Fact |
|-----|-------------|------|
| `main` tip | **`eb4a9f7`** | `feat(fetch): add fetch-models.mjs for automated weights downloading and make-moderation harness` (electrobrian, 2026-09-08) |
| `host/note9` tip | **`260db2a`** | `fix(vision): image/audio requests get a clean 503, not a text-model 500 (issue #1)` (electrobrian, 2026-08-30) |
| Compare `host/note9...main` | status **ahead**, **ahead_by: 42**, behind_by: 0 | **`main` is 42 commits ahead of `host/note9`** (API 2026-09-12). Stand-up phrase “origin/host/note9 42 commits ahead” is **inverted** vs GitHub; do not rebase host work as if it were tip-of-line. |
| Compare `main...host/note9` | status **behind**, ahead_by: 0, behind_by: 42 | Confirms host tip is ancestor of `main`. |
| Same tip on | `host/godslove`, `host/pixel8` | Both also `@ 260db2a` (stale host markers). |
| `host/qodesh` | `1d8bbb9` | `feat: operator GET /, Brainz import, session working-set injection` — between note9 tip and main tip. |

**Note9-relevant commits already ancestral to / present on `main` (cite messages, not invention):**

| SHA | Message (subject) |
|-----|-------------------|
| `3291e0f` | Land Note 9 Termux gateway status and phone RAM headroom. |
| `023966e` | docs: map security monitor component boundaries |
| `87e91ad` | feat(gateway): peer allowlist - expose to one specific LAN host, not all |
| `ffa6767` | refactor: adb peering is launch-harness, not baseline; KV cache defaults q8_0 |
| `4085902` | feat(native): fix whisper (multipart), add image txt2img; **language-input** test artifacts |
| `680bc67` | feat(tts): run piper as a one-shot; /tts returns synthesized audio |
| `c702f21` | fix(routing): **never fail closed** - general-text is the unconditional safety net |
| `260db2a` | fix(vision): image/audio → clean **503** (issue #1) |
| `9889493` | feat(security): add **security slash** dispatches, wrong-tool handoffs, and **activity watchdog** |
| `a152bd0` | feat(tts): festival/flite + **optimize note9 and windows profiles** |
| `1d8bbb9` | Brainz import via `GREEN_BRAINZ_ROOT` (MFL-17 seam); GET / operator page |
| `d0b261b` | feat(session): persist working set as jsonl… Domain tests **75/75** |

**Windows / security / models on tip of `main` (post–host tip):** council/prompt/prime chain (`9e671ba`…`445e5ad`), Windows MVP land (`0336d76`), Unicorn/UAT (`ff117b1`…`a3d05a0`), models harnesses (`c529ce4`), fetch-models (`eb4a9f7`).

**Open issues (API, state=open):**

| # | Title | Role for this cut |
|---|-------|-------------------|
| **#2** | host/note9: bring up… (SDM845, Android 10, no root) | **Primary ship gate** |
| #1 | Wire treasury… vision path broken | Upstream of vision; 503 fix on `260db2a`/`main`; full VL still open |
| #3 | host/pixel8 | Out of primary cut (sibling host) |
| #4 | host/qodesh degraded | Other team / Windows |
| #5 | host/godslove FreeBSD | Out of primary cut |
| #6 | /skill /zkill | Adjacent; Brainz/zkillz |
| #7 / #8 | council cascade / quorum | WIP branches `wip/council-cascade` `7414812`, `wip/council-quorum` `727d344` — merge after note9 UAT unless needed |
| #9 | offline council/stock-prompt tracking | Context |
| **#10** | Import green-brainz **by reference** — do not vendor-copy | Linguistics/MFL fold-in gate |

**Paths on `main` (tree listing 2026-09-12):**  
`docs/note9-termux.md`, `config/agents.note9.json`, `scripts/note9-*.sh`, `docs/security-monitor-{component-map,requirements,audit}.md`, `src/monitor/*`, `policies/security-monitor.md`, `deploy/adb-peer.mjs`, `docs/deployment.md`, `docs/fleet-targets.md`.

### 2.2 GitHub — papers (https://github.com/brianreborn/papers)

| Folder | Primary artifact | Thesis (from README / TeX abstract — not invented) |
|--------|------------------|------------------------------------------------------|
| `memory-like-trait-inheritance/` | `Memory_Inheritance_Working_Paper.tex` | Experiences can epigenetically transmit adaptive behavioral tendencies (memory-like traits) to offspring. |
| `continuum-aerosol-computing/` | `Continuum_Aerosol_Computing_Working_Paper.tex` | Electrified continua can compute by evolving heritable charge/vortex biases; Merge physical below, library above. |
| `cognitive-architecture/` | `README.md`, `COGNITIVE_REQUIREMENTS.md`, `agent-memory-architecture.md` | Dreamcatcher CoW epigenetic memory; subconscious injection; seizure/MRU; IRQ; Drive Registry / idle promote. |
| `fleet-bootstrap/` | `agents-bootstrap.json`, `parallel-fleet-bootstrap.ps1`, `qodesh-startup.ps1` | Windows fleet bootstrap shapes (ports 8080/8081, token files). |

README also records originating X URLs (cite only; **bodies not fetched in this pass**):  
`https://x.com/born_brian85001/status/2092254278077517988` (MFL),  
`https://x.com/born_brian85001/status/2093285342183043098` (continuum).

### 2.3 GitHub — green-agentz (recent themes)

Recent `main` themes (electrobrian SHAs): Brainz CognitiveHost write-through impress + green-dreamz nap (`cd78e4c`); MFL phases/nap/fugue (`60f3af5`); zkillz+brainz companion pack install-by-path no Roomz copy (`65fd492`); Roomz live UAT + isolated e2e as gates (`1b8933e`). Aligns with Roomz #10.

### 2.4 Twitter/X

| Status | Note |
|--------|------|
| **Pending** | Primary source declared; this planner did **not** retrieve tweet bodies. Do **not** invent quote text. When available, paste verified text under a “Twitter primary quotes” subsection and link status IDs above. |
| Reachability | `https://x.com/born_brian85001` returned HTTP 200 at survey time; content not scraped into this board. |

### 2.5 Box / fleet context (operator + boards)

| Fact | Source |
|------|--------|
| Hosts: qodesh (Win, this machine), shalom, godslove, note9, pixel8; new ISP → LAN/WAN/tunnel newly viable | Operator context + RELEASE-READINESS |
| Dual SuperGrok teams; other Researcher `09f2d365…` idle until quota reset | Operator context |
| Box trees: `/workspace/session/green-roomz` (older), `/workspace/grz-src` (patch drop), reviews under `/workspace/reviews/{MVP,boundary,covert,fuzz,platform,product,race,release,security}` | Box inventory |
| Boundary grades: route allowlist D+, caps advertise-only D, note9/peer F | `boundary/BOARD.md` |
| Platform: note9 readiness **F**; PATH/SIG/LOC findings | `platform/BOARD.md` |

---

## 3. Current note9 capability vs gaps

### 3.1 Present on `main` / documented (capability)

From `docs/note9-termux.md` + `config/agents.note9.json` + commits above:

| Capability | Evidence | State |
|------------|----------|-------|
| Termux gateway on `:8080`, adb forward | note9-termux.md; chat smoke HTTP 200 ~4.5s (2026-08-29) | Documented live once |
| SELinux workaround: copy ELF to `~/grz-runtime` | `3291e0f`, note9-termux.md | Required procedure |
| RAM headroom 256 MiB if totalmem < 8 GiB | note9-termux.md § RAM admission; `src/memory.mjs` | On main |
| Resident **tool-router** only GGUF on phone (`:8187`) | agents.note9.json; note9-termux.md | Design intent |
| Peer allowlist + `deploy/adb-peer.mjs` | `87e91ad`, `ffa6767`, deployment.md | Code on main; **not** wired in agents.note9.json gateway block yet |
| Routing never-fail-closed → general-text | `c702f21` | On main |
| Piper one-shot TTS path | `680bc67`; note9 profile TTS optimize `a152bd0` | Code on main; note9 piper runtime/model still **missing** stubs |
| Vision/audio clean 503 | `260db2a` | On main |
| Security-monitor logical agent + `src/monitor/*` + slash/watchdog | agents.note9.json alias; `9889493`; component-map | Present; effect stubs reject |
| Measured 0.5B: tg32 **23.8** tok/s, pp64 **36.8** | note9-termux.md; fleet-targets.md | Recorded |
| Scripts | `scripts/note9-termux-setup.sh`, `note9-enable-external-apps.sh`, `note9-restart-serve.sh`, `note9-run-llama-server.termux.sh`, `note9-sync-models.ps1` | On main |

### 3.2 Gaps (blockers / high)

| Gap | Why it matters | Tracker |
|-----|----------------|---------|
| `host/note9` **42 behind** `main` | Device checkout on stale tip misses security slash, TTS profile opts, Windows-era session/Brainz/UAT gates | FF/merge before pack |
| Issue **#2** checklist unchecked | No current registered note9 machine on this account; bring-up not re-verified post–`eb4a9f7` | #2 |
| Specialists mostly `/data/local/tmp/grz/missing/*` | Only nexus (+ optional coder path if model present) usable; general-text missing → fallback degraded | agents.note9.json |
| Piper/whisper/sd commands point at missing binaries | TTS/ASR/image gen unavailable on device | agents.note9.json runtimes |
| Platform SIG-03: WindowsHostAdapter on non-win32 | Fingerprint/priority wrong under Termux | platform BOARD |
| Boundary: capability bits advertise-only; loose `/route` | Security capability not request-enforced | BND-01..04 |
| `allow_peers` not in note9 manifest | LAN/tunnel punch needs explicit peer list + API key story | deployment.md vs agents.note9.json |
| Adreno 630 Vulkan/OpenCL | CPU-only pack; GPU later | note9-termux “Next” |
| Linguistics locale (LOC-01/02/08) | English-only policies/slash; RTL/CJK risk on phone | platform BOARD |
| Brainz #10 not live on :8080 | Import-by-ref wire open | #10 |
| Dual-edit / quota | Other team wake + GH auth gaps | RELEASE-READINESS |

---

## 4. Security workstream (defensive only)

**Scope:** harden trust boundary, capability enforcement, monitor mailbox, peer allowlist, tunnel **design**.  
**Out of scope:** exploits, attack PoCs, offensive tunnel bypass recipes, lockdown/reboot that succeed, Magisk/root.

### 4.1 Boundary / capability (from `boundary/BOARD.md` + main code)

| Priority | Item | Exit criterion |
|----------|------|----------------|
| P0 | Exact route allowlist; fixed upstream paths (BND-01) | No client-controlled backend path suffix |
| P0 | Modality ∩ `gateway_accepted_capabilities` on slash + direct (BND-03/04) | `/vision` without image rejected; caps enforced |
| P0 | Port grz-src sanitizers / nexus allowlist into integrate tree (BND-02/06) | headerSafe/stripControls/allowlistedPlan in serve tree |
| P1 | Policy always prepended; strip client system marker bypass (BND-05) | Tests prove inject |
| P1 | Manifest `${}` fail-closed + path jail under `GRZ_ROOT` (BND-07 / PATH-02) | Validate fails on empty expand |
| P2 | Explicit `POST /lockdown` `/reboot` → **501/403** not empty 200 (monitor stubs) | Documented reject |
| P2 | SSE/header ESC strip (BND-10) | No raw C0/C1 to client |

### 4.2 Monitor (docs on main)

Cite `docs/security-monitor-component-map.md` + `docs/security-monitor-requirements.md`:

- **Sentinel** observe (`mailbox`, logger, identity, ids, entropy, ipc) — no mutation authority.
- **Council** evaluate (`policy`, gate, states, calls) — auditable; quorum **not** simulated by single-process success.
- **Warden** mediate (`respond`, isolate, network, place) — unsupported actions **reject**.
- Public payloads **cannot** invoke lockdown/reboot/secure reboot/volume encryption/destructive memory ops.
- Complex: `vote()` / `secureReboot()` throw `complex-last` this sprint.

Slash + activity watchdog: `9889493` on `main`.

### 4.3 Peer allowlist / tunnel (new ISP)

| Layer | Defensive design | Exit criterion |
|-------|------------------|----------------|
| Manifest | `gateway.allow_peers: [<peer-ip-or-cidr>]`; loopback always allowed (`87e91ad`) | Non-listed remote → **403 forbidden_peer** |
| Bind | Specific LAN bind allowed with allow_peers or API key; `0.0.0.0` still needs `GREEN_ROOMZ_ALLOW_PUBLIC=1` + key | Documented in deployment.md |
| ADB harness | `deploy/adb-peer.mjs` injects resolved device IP at launch — **not** in `src/` | Used for USB bring-up only |
| Tunnel | New ISP makes WAN punch viable — **design-only** until note9 online: prefer private VPN / reverse tunnel terminating on allowlisted peer IP; never open world without key | Design note in checklist; no punch until UAT peer green |
| note9 manifest | Add `allow_peers` + optional `GREEN_ROOMZ_API_KEY` when exposing beyond adb-forward | Checked on device |

---

## 5. Linguistics / compsci fold-in map

| Paper / artifact | Green-Roomz surface | Fold-in action (concrete) |
|------------------|---------------------|---------------------------|
| **MFL** `memory-like-trait-inheritance` (TeX abstract + README) | Brainz / session working-set; Dreamcatcher impress; #10 import | Treat CoW / nap / tryPromote as **epigenetic** memory (bias/tendency), not full episodic dump into prompts. Wire via `GREEN_BRAINZ_ROOT` only — **no vendor copy** (#10). Session jsonl (`d0b261b`) stays L1 bounded. |
| **Cognitive-architecture** Dreamcatcher + `COGNITIVE_REQUIREMENTS.md` | Gateway subconscious inject (REQ-1.*); Orchestrator seizure/MRU (REQ-4.*); IRQ (REQ-6.*); Drive Registry idle promote (REQ-8.*) / #10 IRQ-1–12 | Map REQs to existing `sessions.mjs` / Brainz CognitiveHost (`cd78e4c` agentz). Stock frames / compileStockPrompt (#9/#10 stock frames). Council judge must **not** silently use security-monitor as backend without model (issue #9 note). |
| **Continuum-aerosol** | Council / routing metaphor docs + CAL-style primitives as **prompt frames** only | Do **not** put PDE/corona chamber into gateway. Optional stock-prompt frame: declare_bias / merge / measure as operator linguistics for council cascade (#7) vocabulary. |
| **fleet-bootstrap** | Host launch / note9+qodesh bring-up scripts | Align note9 serve + peer with `agents-bootstrap.json` patterns (gateway :8080, router port, token files) adapted to Termux paths `${HOME}/grz-runtime`. |
| **Locale / Merge commentary** (prior-merge in papers; LOC-* platform) | Routing slash; nexus English HANDOFF; TTS voice | Document English-nexus constraint; add non-English **smoke** cases; keep ASCII slash with explicit degradation note; piper voice remains en_US until artifacts exist. |
| **green-agentz** MFL/Brainz/zkillz | `/skill` `/zkill` (#6); companion pack | Install-by-path; Roomz references Agentz — dual-team: this team consumes API, other may pack Agentz. |

Twitter status URLs are **citation anchors** only until bodies are pasted (see §2.4).

---

## 6. Dual-team work split

| This team (active) | Other account on wake (`09f2d365…`) |
|--------------------|-------------------------------------|
| note9 integrate + Issue **#2** ship | qodesh / Windows polish (#4); shalom Vulkan when online |
| FF `host/note9` ← `main@eb4a9f7` (local only; **no push** unless operator asks) | Avoid touching `config/agents.note9.json`, `docs/note9-termux.md`, `scripts/note9-*` |
| Boundary fix packs → Release Driver fold (BND-*) | Platform Job Object / stop-script (SIG-01/02) on Windows trees |
| Peer/tunnel **design** + note9 `allow_peers` | Public bind / McAfee / LocalAI path hygiene on Win |
| Linguistics map → prompts / Brainz import smoke on note9 | Council #7/#8 review merge order when note9 UAT green |
| `/workspace/reviews/release/*` boards | Do not rewrite this plan; append dated addenda only |
| Stay off `config/agents.windows.json` heavy edits | Own windows manifest / Unicorn / fetch-models dogfood |

**Collision rule:** file ownership by path prefix; communicate via reviews boards, not simultaneous edits of `src/gateway.mjs` without a single integrator.

---

## 7. Phased milestones + exit criteria

### Phase A — Integrate (`host/note9` ← `main`)

| Exit criteria |
|---------------|
| Local checkout understands `main@eb4a9f7` vs `host/note9@260db2a` (42 behind). |
| Integrate tree contains note9 scripts + agents.note9.json + monitor + peer code. |
| Box/unit: domain tests still green (historical 75/75 at `d0b261b`; re-run on integrate tree). |
| No push. |

### Phase B — Harden (security capability)

| Exit criteria |
|---------------|
| BND-01/03/04 (+ sanitizer port) landed or fix-pack queued with tests. |
| Monitor: lockdown/reboot stubs explicit reject; slash/watchdog reachable in validate. |
| `allow_peers` design written; note9 manifest field ready (may stay loopback-only until LAN UAT). |
| Boundary board grades route/caps move off D/F for note9 path. |

### Phase C — Linguistics cut

| Exit criteria |
|---------------|
| Fold-in map §5 reflected in docs or stock frames (cite paper paths). |
| `GREEN_BRAINZ_ROOT` import smoke (or documented skip if Agentz absent on device). |
| Locale smoke plan: EN + one RTL/CJK string through nexus without crash. |
| #10 checklist items not claimed done unless live on :8080. |

### Phase D — note9 pack

| Exit criteria |
|---------------|
| Follow `docs/note9-termux.md`: runtime in `~/grz-runtime`, JS in `~/green-roomz`, models as documented. |
| `validate --manifest config/agents.note9.json` OK. |
| `serve` → `/health` 200; nexus resident; specialists unavailable cleanly. |
| Issue #2 bullets checked (except optional Adreno). |

### Phase E — UAT (localhost / adb forward only)

| Exit criteria |
|---------------|
| `adb forward` health + chat smoke; optional `scripts/uat.mjs` subset. |
| Peer 403 for non-allowlisted (if LAN bind tested). |
| Vision/audio without specialist → **503** not text 500. |
| No WAN exposure without key; no reboot/lockdown success paths exercised. |

---

## 8. Risks

| Risk | Mitigation |
|------|------------|
| **RAM** (~5.7 GB total, ~3 GB free) | Resident 0.5B only; `max_warm_specialists: 1`; 256 MiB headroom; `admit_when_tight: refuse` in agents.note9.json |
| **SELinux** blocks `/data/local/tmp` exec | Always copy to `~/grz-runtime`; never Magisk for this cut |
| **Adreno 630** | CPU pack only; Vulkan/OpenCL deferred |
| **Dual-edit collision** | Path ownership §6; other team idle until quota |
| **Quota** (other Researcher) | This team owns note9 ship; handoff via boards |
| **Stale host branch narrative** | Use GitHub compare (main +42) not inverted stand-up |
| **Missing specialist GGUFs** | Accept unavailable; never fail-closed to empty 422 when general-text absent — document degradation |
| **Tunnel temptation** | Design-only until allowlist+key; localhost-first |
| **Invented Twitter** | Status URLs only until bodies verified |

---

## 9. Immediate next 10 concrete tasks (ordered)

1. **Correct branch mental model** in all boards: `main@eb4a9f7` = tip; `host/note9@260db2a` = **42 behind** (cite compare API). Update RELEASE-READINESS if needed.  
2. **Register / attach note9** (Termux SSH or Grok machine) or drive via adb from qodesh/shalom — unblock Issue #2 live probes.  
3. **Local FF plan:** on qodesh tree, merge/rebase `host/note9` onto `main` **without push**; resolve agents.note9.json vs windows-only keys.  
4. **Absorb Boundary P0 fix packs** (route allowlist, capability gate, sanitizers) into integrate tree; run `node --test`.  
5. **Patch `config/agents.note9.json`**: add `allow_peers` placeholder (loopback-only deploy OK); confirm `security-monitor-agent` + health_aliases; leave missing specialists as missing.  
6. **Re-run Termux pack procedure** per `docs/note9-termux.md` + `scripts/note9-termux-setup.sh` on device; prove `/health` 200.  
7. **Security UAT localhost:** slash/watchdog paths; confirm lockdown/reboot **reject**; peer 403 unit/integration if bind non-loopback.  
8. **Linguistics cut-0:** add short `docs/` or reviews note mapping papers → surfaces (§5); optional stock frame stub for MFL/Dreamcatcher vocabulary.  
9. **Brainz seam check:** if green-agentz present, set `GREEN_BRAINZ_ROOT` and smoke CognitiveHost; else document #10 blocked-on-pack.  
10. **UAT gate:** adb-forward chat smoke + 503 vision-without-model; tick Issue #2 checklist items; refresh `note9-readiness-checklist.md`.

---

## 10. Document control

| Field | Value |
|-------|-------|
| Created | 2026-09-12 |
| Author | Grok executor (release planning) |
| Primary sources | GitHub API/raw for green-roomz, papers, green-agentz; box reviews; operator context |
| Explicitly not used as fact | Invented tweet text; inverted “42 ahead” without correction |


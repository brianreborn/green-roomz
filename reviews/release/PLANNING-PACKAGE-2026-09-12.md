# Note9 planning package — consolidated — 2026-09-12

**Audience:** operator  
**Synthesized from (existing boards only; no invented tweet bodies or SHAs):**
- `/workspace/reviews/release/note9-release-plan-2026-09-12.md`
- `/workspace/reviews/release/note9-readiness-checklist.md`
- `/workspace/reviews/release/ongoing-dev-efforts-2026-09-12.md`
- `/workspace/reviews/x-primary-source-2026-09-12.md`
- `/workspace/reviews/x-archive-2022-themes.md` (theme counts + note9 section)
- `/workspace/reviews/release/RELEASE-READINESS.md` (stand-up; branch narrative corrected below)

**Not present this pass:** `ongoing-dev-efforts-INTERIM-2026-09-12.md`

**Hard rules (inherited):** localhost / adb-forward · defensive security only · no `git push` unless operator asks · no reboot/lockdown success · do not invent tweet text · dual-team path ownership

---

## 1. Goal

Ship an **excellent note9-local Green-Roomz cut** on Samsung Galaxy Note 9 **SM-N960U** (Termux, no root) that delivers:

1. **Real security capability** — security-monitor mailbox + slash/watchdog already on `main` (`9889493`); peer allowlist + tunnel **design** for new ISP; Boundary capability gates closed (BND-*); monitor stubs that **reject** lockdown/reboot (never false-success).
2. **Operator linguistics / compsci fold-in** — map `brianreborn/papers` (MFL, continuum-aerosol, cognitive-architecture/Dreamcatcher, fleet-bootstrap) onto Roomz surfaces (prompts, routing, locale, Brainz/MFL import, council) **by reference** only (#10 — no vendor-copy).
3. **Device reality** — resident tool-router GGUF only on phone; `~/grz-runtime` exec path; 256 MiB RAM headroom when `totalmem < 8 GiB`; specialists gated / missing-as-unavailable.

**Success:** Issue **#2** checklist green on device; security workstream signed defensive-only; linguistics map landed as prompts/docs/import seams; dual-team file ownership respected; UAT on localhost/`adb forward` only.

---

## 2. Primary-sources inventory

| Source | Status | What we HAVE | Blocked / gap |
|--------|--------|--------------|---------------|
| **GitHub `brianreborn/green-roomz`** | HAVE | Tips, compares, issues #1–#10, note9 paths/docs/scripts on `main`; compare API confirms branch truth | This account: no `gh` login / connector (cited in RELEASE-READINESS / efforts catalog) |
| **GitHub `brianreborn/green-agentz`** | HAVE | `main@1b8933e`; zkillz alpha tag; PR #1 etioz; issues #1–#14 themes | Live `:8080` Brainz wire still open (#3 / Roomz #10) |
| **GitHub `brianreborn/papers`** | HAVE | MFL / continuum-aerosol / cognitive-architecture / fleet-bootstrap folders; README cites X status URLs as anchors | Tweet **bodies** for those status IDs not fetched into boards |
| **GitHub `brianreborn/green-agency`** | HAVE (retired) | Redirect tip `6a4e0d7`; Agentz #4 still wants archive/lock | Do not open new work |
| **Live X `@born_brian85001` / `@BrianReborn_alt`** | PARTIAL / BLOCKED | Public profile cards: short visible window captured in `x-primary-source-2026-09-12.md` (5+5 posts + visible reposts); themes mostly personal/legal/OSINT — **no** note9/Termux/linguistics/compsci release detail in that window | Login wall on `from:` live search; deeper timeline / 30–50 export blocked without credentials (none entered) |
| **2022 archive `@electrobrians`** | HAVE | `/workspace/uploads/twitter-2022/` mined → `x-archive-2022-themes.md`; 17023 tweets to 2022-06-27; theme hit table + note9 precursor section | Cutoff 2022-06-27 — **not** 2026 continuum/MFL status IDs; zero hits Termux/LLM/Grok/locale/tokenizer/unicode/NAT/Capsicum/continuum |
| **Papers-cited X status URLs** | CITATION ONLY | `…/2092254278077517988` (MFL), `…/2093285342183043098` (continuum) listed in release plan §2.2 | Bodies **not** pasted; do not invent |
| **Box trees / reviews** | HAVE | Release/boundary/platform boards; `/workspace/session/green-roomz` (older, not tip); `/workspace/grz-src` patch drop | Session ≠ `main@eb4a9f7` |
| **qodesh live git status** | UNKNOWN | Last recorded dirty 2026-09-07 (Agentz #2); forensic 2026-09-11: connected, serve DOWN | Live `git status -sb` not run this planning pass |
| **note9 device** | OPEN | Issue #2 serial `27841130ae1c7ece`; historical tok/s in docs | Unregistered on this account; Issue #2 unchecked |

**2022 archive note9 takeaway (from board § “How this informs note9 release”):** high density trust/FreeBSD/security/compute establishes long-running vocabulary; memory/aerosol/epigen/agent are thematic seeds; do not claim Termux/locale/etc. appear in the 2022 dump; cite id + created_at + short full_text only.

**2026 live X takeaway:** visible cards do **not** supply a concrete security model, tunnel/NAT design, or linguistics/compsci release requirements — use for oversight/provenance posture only until deeper capture is authorized.

---

## 3. Correct git fact

| Ref | SHA (short) | Fact |
|-----|-------------|------|
| `main` tip | **`eb4a9f7`** | Tip of line (fetch-models / moderation harness, 2026-09-08 push window) |
| `host/note9` tip | **`260db2a`** | Vision/audio clean 503 (issue #1 lineage); same tip as `host/pixel8`, `host/godslove` |
| Compare `host/note9...main` | **ahead_by: 42**, behind_by: 0 | **`main` is 42 commits ahead of `host/note9`** |
| Compare `main...host/note9` | ahead_by: 0, behind_by: 42 | Host tip is an **ancestor** of `main` |

**Correction:** older RELEASE-READINESS / stand-up phrasing “`origin/host/note9` 42 ahead of `main`” is **inverted**. Do not rebase or treat host work as tip-of-line. Fast-forward / merge direction for integrate: **`host/note9` ← `main@eb4a9f7`** (local only; no push unless operator asks).

Also on remote (for awareness): `host/qodesh@1d8bbb9` (15 behind main, 0 unique); `wip/council-cascade@7414812` / `wip/council-quorum@727d344` unmerged — hold merge until note9 UAT unless operator asks.

---

## 4. Ongoing efforts matrix (top 15) — dual-team ownership

Selected from the 27-effort catalog for operator focus on the note9 security + linguistics cut.

| # | Effort | Tracker / tip | This team (note9 integrate+ship) | Other team (on wake / Windows·shalom) |
|---|--------|---------------|----------------------------------|---------------------------------------|
| 1 | Roomz `main` beta tip | `main@eb4a9f7` | Consume as canonical remote; no push-race | Owns tip history (electrobrian pusher); Unicorn/models/fetch dogfood |
| 2 | host/note9 Termux bring-up | Roomz **#2**; branch `260db2a` (**42 behind**) | **Primary ship gate** — local FF + pack + UAT | Stay off `agents.note9.json`, `docs/note9-termux.md`, `scripts/note9-*` |
| 3 | Boundary / capability / sanitizers | BND-01..07; grz-src lag | Absorb P0 packs into integrate tree | Avoid simultaneous `src/gateway.mjs` edits |
| 4 | Security slash + monitor reject | `9889493` on main; monitor docs | Wire validate + localhost UAT; stubs reject only | Shepherdz extraction (Agentz #7) joint review later |
| 5 | Peer allowlist / tunnel design | `87e91ad` / deployment.md; new ISP | Design + note9 `allow_peers`; no WAN punch until UAT | Public bind / Win path hygiene |
| 6 | Import Brainz by reference | Roomz **#10**; Agentz **#3**; `1d8bbb9` | Consume via `GREEN_BRAINZ_ROOT` only | Agentz owns Brainz pack; no Roomz tree copy |
| 7 | Linguistics / papers fold-in | papers `main@2d5c481`; plan §5 | Map → prompts/docs/locale smoke; stock frames by ref | papers scholarly land already theirs; Roomz references |
| 8 | Vision / treasury scanner | Roomz **#1**; 503 on main | Accept 503 without specialist on note9 | Shalom VL perf + any local-only SHA (`584d2b9` **not** on public remote) |
| 9 | Council cascade / quorum | **#7/#8**; `wip/*` unmerged | **Do not merge** during note9 UAT unless asked | Review/merge after note9 green (issue #9 order) |
| 10 | `/skill` `/zkill` host load | Roomz **#6**; Agentz alpha | Adjacent smoke if pack present | Pack nits Agentz #11; Win zkillz runner #10 |
| 11 | host/qodesh degraded Windows | Roomz **#4**; `host/qodesh` 15 behind | Do not reset/commit dirty qodesh tree | Live git audit + Windows polish (Agentz #2) |
| 12 | host/pixel8 / godslove | **#3** / **#5**; stale `@260db2a` | Out of primary cut | Own when those boxes exist; pqfreebsd linkage for #5 |
| 13 | Agentz MFL / Dreamcatcher / nap | Agentz **#8/#14**; `60f3af5` / `cd78e4c` | Fold vocabulary via import seam | Finish MFL loop / Grok-nap ownership |
| 14 | green-etioz charter | Agentz **PR #1** / `skill/etioz` | Awareness only (Roomz #6 adjacent) | Ratification / merge decision |
| 15 | green-agency retire + fleetz hold | Agentz **#4/#6** | Do not create green-fleetz / vendor agency | Archive agency; keep fleetz non-repo |

**Collision rule:** one integrator for `src/gateway.mjs` / council / Brainz seam / `main` pushes; communicate via `/workspace/reviews/*` boards.

---

## 5. Immediate 10 tasks (ordered)

1. **Correct branch mental model everywhere:** `main@eb4a9f7` tip; `host/note9@260db2a` = **42 behind** (cite `host/note9...main`). Treat RELEASE-READINESS inverted phrase as superseded by this package + note9 plan.
2. **Register / attach note9** (Termux SSH or Grok machine) or drive via adb from qodesh/shalom — unblock Issue #2 live probes (serial historically `27841130ae1c7ece`).
3. **Local FF plan** on qodesh tree: merge/rebase `host/note9` onto `main` **without push**; resolve `agents.note9.json` vs windows-only keys.
4. **Absorb Boundary P0** (exact route allowlist, modality∩caps, sanitizers/nexus allowlist from grz-src) into integrate tree; run `node --test`.
5. **Patch `config/agents.note9.json`:** intentional `allow_peers` (loopback-only OK); confirm `security-monitor-agent` + health_aliases; leave missing specialists missing.
6. **Re-run Termux pack** per `docs/note9-termux.md` + `scripts/note9-termux-setup.sh`; prove `/health` 200; runtime in `~/grz-runtime`.
7. **Security UAT localhost:** slash/watchdog; lockdown/reboot **reject**; peer 403 if non-loopback bind tested; no WAN open punch.
8. **Linguistics cut-0:** short docs/reviews note mapping papers → surfaces; optional stock-frame stub for MFL/Dreamcatcher vocabulary (by reference).
9. **Brainz seam check:** if green-agentz present, `GREEN_BRAINZ_ROOT` smoke; else document #10 blocked-on-pack.
10. **UAT gate:** adb-forward chat smoke + vision/audio **503** without specialist; tick Issue #2 items; refresh living checklist with evidence.

---

## 6. Open questions for operator

1. **Cut pick:** proceed Phase A integrate now, or stay on RELEASE-READINESS hold until note9 is registered?
2. **Device access:** preferred path — register note9 machine here, adb from qodesh (`19f2c19e-…`), or Senior Dev / shalom side?
3. **Push policy:** confirm continue **no push** of `host/note9` FF, or authorize a dated push after local green?
4. **X primary depth:** authorize authenticated deeper capture of `@born_brian85001` / papers status IDs (bodies only, no mutations), or keep citation-URL + 2022 archive + partial public cards as sufficient for this cut?
5. **Council #7/#8:** hard hold until after note9 UAT, or need cascade vocabulary for linguistics cut-0?
6. **qodesh dirty tree:** other team owns audit — should this team refuse all writes under `C:\Users\brian\Documents\green-roomz` until Agentz #2 closes?
7. **Peer/tunnel:** any allowlisted peer IP/CIDR for LAN UAT after new ISP, or stay loopback/`adb forward` only through ship?
8. **Adreno / specialists:** confirm CPU-only pack + missing specialists as explicit ship scope (defer Vulkan + Piper/whisper binaries)?
9. **Other Researcher `09f2d365…`:** still idle/quota-gated — any wake window this team must clear note9 file locks for?
10. **RELEASE-READINESS board:** OK to treat this planning package as superseding its inverted “42 ahead” line without rewriting that file in-place?

---

## Document control

| Field | Value |
|-------|-------|
| Created | 2026-09-12 |
| Method | Consolidate existing box boards only |
| Explicitly not used as fact | Invented tweet text; invented SHAs; inverted host-ahead narrative |
| Living checklist | `/workspace/reviews/release/note9-readiness-checklist.md` |
| Full plan | `/workspace/reviews/release/note9-release-plan-2026-09-12.md` |
| Efforts catalog | `/workspace/reviews/release/ongoing-dev-efforts-2026-09-12.md` |


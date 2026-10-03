# Dual SuperGrok team — sync / handoff plan — 2026-09-12

**Audience:** operator Brian · THIS team (New Bot + specialists) · OTHER Researcher `09f2d365-d312-428c-870d-e733a6504c0d`  
**Purpose:** keep both SuperGrok teams coordinated via **GitHub issues**, file-path mutex, and `/workspace/reviews/*` boards — **do not step on toes** developing features.  
**Authority:** operator dual-team rules already on `PLANNING-PACKAGE-2026-09-12.md` §4, `GOAL-UPDATE-3OS-NOTE9VM-2026-09-12.md` §3, `ongoing-dev-efforts-2026-09-12.md` §3–4, `OFFLINE-SECURITY-WORKSTATION-PLAN-2026-09-12.md` §6.  
**Companion paste:** `/workspace/reviews/release/GH-ISSUE-DRAFT-dual-team-coord.md`

**Hard rules (unchanged):** defensive only · no exploits/PoCs · no plaintext creds · **no `git push` unless operator asks** · one integrator for gateway / council / Brainz / `main` · communicate via **GitHub issues first**, boards second · do not invent SHAs or quota ETAs.

**Known tips only (do not invent more):**
- Remote Roomz `main` = **`eb4a9f7`** (`eb4a9f74bef93c2792c34041a03a0d33eb0f9e5f`)
- Box dispatch land = **DISPATCH-FIX-01** in `/workspace/grz-src` (box-only; **no land SHA**; live qodesh bounce still pending)
- `host/note9` is **42 behind** `main@eb4a9f7` (compare `host/note9...main`); do not invert

---

## 0. Team identities

| Slot | Who | State (2026-09-12) | Default ownership |
|------|-----|--------------------|-------------------|
| **THIS** | Active SuperGrok: **New Bot + specialists** (Release Driver, Boundary, Fuzz, Race, Platform, Covert, Forensic, Review Board Viewer) | **Live** | Offline security workstation **image matrix** (3 OS lines), Note9 **VM** ship-cell docs, DISPATCH P0 integrate (FIX-01 done on box), knowledge-library matrix, **fleet live console** pack/deploy |
| **OTHER** | Researcher chat id **`09f2d365-d312-428c-870d-e733a6504c0d`** (other SuperGrok account; historically Windows / shalom / Unicorn / fetch-models) | **Idle — awaiting SuperGrok quota reset** | On wake: Windows / shalom downloads, qodesh dirty-tree audit (**Agentz #2**), Unicorn / fetch-models dogfood, Roomz **#4** / Agentz **#10/#11/#4**. **Avoid simultaneous `src/gateway.mjs` edits** |

**Integrator (single):** THIS team's Release Driver for `src/gateway.mjs` · council · Brainz seam · any `main` push (push still **operator-gated**).  
**Collision rule:** one integrator; talk via **GitHub issues** **and** `/workspace/reviews/*`. Never silent push-race.

---

## 1. Wake uncertainty (quota)

**SuperGrok quota reset time is UNKNOWN.** Do not invent an ETA, daily allowance, or “it resets at midnight.”

| Fact | Implication |
|------|-------------|
| OTHER is idle **because quota is exhausted / gated** | THIS must finish the pre-wake checklist **and leave OTHER lanes untouched** so wake is instant, not a merge fight |
| Reset clock | **Operator must supply** either (a) a screenshot / paste of the SuperGrok **usage UI**, or (b) the **usual reset** they already know from prior cycles |
| Until that lands | Treat wake as **event-driven**, not scheduled. THIS does not pause image / dispatch / library work waiting for a guessed hour |
| When OTHER first messages | That message **is** wake. OTHER's first duty is the handoff packet (§3) + a `WAKE` comment on the coord issue — **before** any file edit |

**If operator later posts a reset time:** append a dated one-liner on the coord issue (`RESET-ETA <iso> source=<usage-ui\|operator>`). Do not bake guessed times into this file.

---

## 2. Pre-wake checklist (THIS team — complete before OTHER wakes)

Do these **now / while OTHER is idle**. Goal: OTHER can start Windows/shalom/qodesh work without colliding, and THIS has claims posted.

### 2.1 Coordination surface

- [ ] **This plan** landed at `/workspace/reviews/release/DUAL-TEAM-SYNC-HANDOFF-2026-09-12.md`
- [ ] **Issue-body draft** landed at `/workspace/reviews/release/GH-ISSUE-DRAFT-dual-team-coord.md`
- [ ] Operator (or THIS, if `gh` auth appears) **files** the coord issue on `brianreborn/green-roomz` from that draft. **Issue number is TBD until filed** — write it back here and on `RELEASE-READINESS.md` when known
- [ ] First coord-issue comment from THIS: identity + live claims table (§4 template) + “OTHER idle, quota ETA unknown”
- [ ] Labels in §4 created on the repo **if missing** (do not assume they exist). If `gh` is still unauthenticated on this box, operator creates them

### 2.2 File locks THIS must hold or publish

- [ ] **`src/routing.mjs`:** DISPATCH-FIX-01 is **claimed by THIS** (box complete; bounce pending). Post `CLAIM` on coord issue + (when filed) dispatch workstream issue
- [ ] **`src/gateway.mjs` / `nexus.mjs` / `handoff.mjs`:** FIX-01 left these **unchanged**. THIS remains default integrator. **Do not start a second gateway edit** without a claim comment
- [ ] **`/workspace/grz-src/*`:** THIS-owned patch drop. OTHER reads only until handed
- [ ] **Note9 paths** stay THIS: `config/agents.note9.json`, `docs/note9-termux.md`, `scripts/note9-*`, Note9 **VM** guest-profile docs
- [ ] **Leave for OTHER (do not heavy-edit):** `config/agents.windows.json`, Unicorn / `scripts/fetch-models.mjs` dogfood, `C:\Users\brian\Documents\green-roomz` dirty tree
- [ ] **Council `wip/council-*`:** remain **HOLD** (Roomz #7 / #8). No merge during dispatch P0 / image freeze unless operator asks
- [ ] **No `git push`**

### 2.3 Artifact currency (THIS lanes)

- [ ] `RELEASE-READINESS.md` P0 row matches FIX-01: box ACCEPT (15/15) · live bounce **blocked** (local-exec flake) · script `qodesh-bounce-fallthrough.ps1` ready
- [ ] Image-matrix boards current: `GOAL-UPDATE-3OS-NOTE9VM-2026-09-12.md` + workstation plan §10 (3 bases × workstation + Note9 VM = 6 cells)
- [ ] Knowledge-library board + HTML matrix current (`KNOWLEDGE-LIBRARY-CANDIDATES-2026-09-12.md`, `knowledge-approval-matrix.html`) — **out of image freeze**
- [ ] Fleet live-console pack documented as THIS-owned: `/workspace/session/fleet-console/` (`install-qodesh.ps1`, `start-watch-windows.ps1`, `start-watch-box.sh`). Do **not** have OTHER reinstall on shalom/qodesh without a claim
- [ ] Bounce notes warn: copy **only named FIX-01 files**, keep `_bounce-backup-20260912`, never reset the dirty qodesh tree (Agentz #2)

### 2.4 What THIS will **not** do while OTHER is idle (toe-protection)

- Do not `git reset` / commit / stash-pop `C:\Users\brian\Documents\green-roomz`
- Do not start large model downloads on shalom or qodesh
- Do not merge `wip/council-*`
- Do not rewrite OTHER-era Windows MVP notes in-place (append dated addenda only)
- Do not create `green-fleetz` (Agentz #6)

**Pre-wake is complete when:** coord issue is filed (or draft is the only blocker and operator has the paste), THIS claims are posted, OTHER lanes are clean, FIX-01 bounce is scripted not half-applied.

---

## 3. Handoff packet (OTHER Researcher reads **first**)

**Order is mandatory.** No file edits, no qodesh `git status` mutations, no downloads, until items 1–4 are read and a `WAKE` comment exists on the coord issue.

### 3.1 Must-read (this box)

| # | Path | Why |
|---|------|-----|
| 1 | `/workspace/reviews/release/DUAL-TEAM-SYNC-HANDOFF-2026-09-12.md` | **This plan** — mutex, claims, 48h |
| 2 | `/workspace/reviews/release/GH-ISSUE-DRAFT-dual-team-coord.md` | Coord issue body (or the **live** GitHub issue once filed — number TBD) |
| 3 | `/workspace/reviews/release/GOAL-PIVOT-2026-09-12.md` | Ship brand = offline workstation **image**, not note9-as-cut |
| 4 | `/workspace/reviews/release/GOAL-UPDATE-3OS-NOTE9VM-2026-09-12.md` | 3 OS lines + Note9 **VM** ship cell; ownership table §3 |
| 5 | `/workspace/reviews/release/OFFLINE-SECURITY-WORKSTATION-PLAN-2026-09-12.md` | Image plan + dual-team §6 + addendum §10 |
| 6 | `/workspace/reviews/release/DISPATCH-BUGS-2026-09-12.md` | Remaining dispatch majors |
| 7 | `/workspace/reviews/release/DISPATCH-FIX-01-fallthrough-2026-09-12.md` | Box policy land (`routing.mjs` only) |
| 8 | `/workspace/reviews/release/DISPATCH-FIX-01-REVIEW-2026-09-12.md` | ACCEPT box · bounce pending |
| 9 | `/workspace/reviews/release/QODESH-BOUNCE-NOTES-P0-FALLTHROUGH.md` + `qodesh-bounce-fallthrough.ps1` | How (and how **not**) to bounce |
| 10 | `/workspace/reviews/release/RELEASE-READINESS.md` | Living freeze board |
| 11 | `/workspace/reviews/release/PLANNING-PACKAGE-2026-09-12.md` + `ongoing-dev-efforts-2026-09-12.md` **§3–4** | Collision map + recommended split |
| 12 | `/workspace/reviews/release/note9-readiness-checklist.md` + `note9-release-plan-2026-09-12.md` | Client/UAT track (not ship brand) |
| 13 | `/workspace/reviews/release/KNOWLEDGE-LIBRARY-CANDIDATES-2026-09-12.md` + `knowledge-approval-matrix.html` | Separate track — do not entangle into Windows download freeze |
| 14 | `/workspace/reviews/release/MODEL-PACK-INVENTORY-2026-09-12.md` | Strategy (THIS) vs fill/downloads (OTHER on wake) |
| 15 | `/workspace/reviews/{boundary,platform,race}/BOARD.md` + `/workspace/reviews/fuzz-review.md` | Open packs; OTHER does not integrate these into `gateway.mjs` |
| 16 | `/workspace/session/fleet-console/` | THIS fleet live-console pack — read; do not overwrite |

### 3.2 Must-read GitHub issues (existing numbers only)

| Issue | Repo | OTHER action on wake |
|-------|------|----------------------|
| **[Roomz #2](https://github.com/brianreborn/green-roomz/issues/2)** | `green-roomz` | **Stay off** note9 files / scripts unless THIS unclaims |
| **[Roomz #4](https://github.com/brianreborn/green-roomz/issues/4)** | `green-roomz` | Own qodesh degraded Windows track (with Agentz #2) |
| **[Roomz #1](https://github.com/brianreborn/green-roomz/issues/1)** | `green-roomz` | Shalom VL / remaining perf when laptop is up; do not cite missing-remote SHAs as landed |
| **[Roomz #10](https://github.com/brianreborn/green-roomz/issues/10)** | `green-roomz` | Brainz **consume-by-ref** only; no tree copy |
| **[Roomz #7](https://github.com/brianreborn/green-roomz/issues/7)** / **[#8](https://github.com/brianreborn/green-roomz/issues/8)** / **[#9](https://github.com/brianreborn/green-roomz/issues/9)** | `green-roomz` | **HOLD** merge until dispatch P0 + image freeze (or operator asks) |
| **[Roomz #5](https://github.com/brianreborn/green-roomz/issues/5)** | `green-roomz` | godslove / pqfreebsd when that box exists (THIS owns matrix docs now) |
| **[Roomz #6](https://github.com/brianreborn/green-roomz/issues/6)** | `green-roomz` | Adjacent; Agentz pack side is OTHER |
| **[Agentz #2](https://github.com/brianreborn/green-agentz/issues/2)** | `green-agentz` | **First code-adjacent job:** live `git status -sb` / stash **audit** of qodesh `Documents\green-roomz` (last recorded dirty 2026-09-07). Read-only until claimed |
| **[Agentz #3](https://github.com/brianreborn/green-agentz/issues/3)** | `green-agentz` | Brainz/zkillz install-by-path; Roomz consumes |
| **[Agentz #4](https://github.com/brianreborn/green-agentz/issues/4)** | `green-agentz` | Agency archive/lock — OTHER docs lane |
| **[Agentz #6](https://github.com/brianreborn/green-agentz/issues/6)** | `green-agentz` | **Do not create** `green-fleetz` |
| **[Agentz #10](https://github.com/brianreborn/green-agentz/issues/10)** / **[#11](https://github.com/brianreborn/green-agentz/issues/11)** | `green-agentz` | Windows zkillz runner + alpha pack nits |
| **Agentz PR #1** | `green-agentz` | etioz charter — awareness; no silent merge |
| **Coord issue** | `green-roomz` | **TBD number** — file from `GH-ISSUE-DRAFT-dual-team-coord.md`. First OTHER comment = `WAKE` |

Awareness only (do not start): Roomz #3 pixel8; Agentz #7 Shepherdz (joint review later); Agentz #14 Grok-nap.

### 3.3 Trees OTHER must not treat as tip

| Tree | Role |
|------|------|
| `main@eb4a9f7` | Canonical **remote** tip |
| `/workspace/grz-src` | THIS patch drop (FIX-01 + older sanitizers). Ahead of box session; **not** a git SHA |
| `/workspace/session/green-roomz` | Older box session — **not** `eb4a9f7` |
| qodesh `C:\Users\brian\Documents\green-roomz` | Live dirty checkout — **OTHER audit (Agentz #2)** before anyone commits |
| shalom | Offline to this box as of 2026-09-11 heartbeat; registered id `801f51e6-…` |

---

## 4. GitHub issue protocol

**Primary coordination channel = GitHub issues.** Boards under `/workspace/reviews/*` are the evidence locker and dated addenda. Chat is ephemeral.

### 4.1 One issue per workstream

Do **not** dump all work into one mega-thread after the coord issue exists. The coord issue is the **switchboard** (claims, stand-ups, wake). Each workstream gets **one** issue:

| Workstream | Issue | Owner default |
|------------|-------|---------------|
| Dual-team coord / file locks | **NEW** (draft) — number TBD | both (THIS files / operator files) |
| Dispatch P0 remaining | Prefer **one new** `dispatch:` issue **or** a single pinned comment-index on coord until filed — do **not** fork FIX-01 discussion across 4 issues | THIS integrate; Fuzz/Boundary/Race review |
| Note9 phone client UAT | **Roomz #2** (exists) | THIS |
| Note9 **VM** + 3-OS image matrix | **NEW** when operator wants a tracker (do not hijack #2) | THIS |
| qodesh Windows degraded | **Roomz #4** (exists) | OTHER |
| qodesh dirty-tree / host artifacts | **Agentz #2** (exists) | OTHER |
| Shalom / vision | **Roomz #1** (exists) | OTHER on wake |
| Brainz import-by-ref | **Roomz #10** + **Agentz #3** (exist) | Agentz pack OTHER · Roomz consume THIS |
| Knowledge library | **NEW** if operator wants GH tracker; board already landed | THIS (keep out of image freeze) |
| Fleet live console | **NEW** if operator wants GH tracker; pack is `/workspace/session/fleet-console` | THIS |
| Council cascade/quorum | **Roomz #7 / #8** (exist) | HOLD both |
| Windows zkillz runner | **Agentz #10** (exists) | OTHER |

**Rule:** if a workstream has an existing issue, **use it**. Only file new issues for workstreams that have **no** number yet (coord, optional dispatch-index, optional image-matrix, optional knowledge-lib, optional fleet-console).

### 4.2 Labels / assignees convention

Labels may **not** exist yet. Create if missing; never invent a label as if it were already on the repo.

**Proposed labels:**

| Label | Use |
|-------|-----|
| `coord` | Switchboard issue only |
| `team:this-newbot` | THIS is default owner |
| `team:other-researcher` | OTHER is default owner |
| `workstream:dispatch` | Dispatch P0/P1 |
| `workstream:image-matrix` | 3 OS × workstation / Note9 VM |
| `workstream:note9-client` | Phone Termux / Roomz #2 |
| `workstream:windows-shalom` | Downloads, Unicorn, fetch-models |
| `workstream:qodesh-audit` | Agentz #2 / Roomz #4 |
| `workstream:knowledge-lib` | Library matrix (out of freeze) |
| `workstream:fleet-console` | Live console pack/deploy |
| `workstream:brainz` | Import-by-ref seam |
| `lock` | A path is currently claimed |
| `hold` | No merge / no push / no dual-edit |
| `no-push` | Reminder: operator must ask |

**Assignees:** GitHub assignee = **human operator** (`brianreborn`) unless operator assigns a bot identity. Agents are **not** assumed to have GitHub logins on this box (`gh auth` was **not** logged in on the last catalog pass).

**Identity line** (first line of every material comment):

```text
agent: THIS-NewBot | OTHER-Researcher-09f2d365
role: ReleaseDriver | Researcher | Boundary | Fuzz | Race | Platform | …
```

### 4.3 Claim before editing a file path

**Never edit a mutex path silently.** Before the first write:

1. Comment on the **workstream issue** (and copy one line to the **coord** issue if the path is in §5).
2. Wait **15 minutes** or an explicit `ACK` from the other live team if they are awake. If OTHER is still idle, THIS may proceed after the claim comment exists.
3. Then edit.

**Claim comment template:**

```text
agent: THIS-NewBot | OTHER-Researcher-09f2d365
CLAIM
path: src/gateway.mjs
tree: /workspace/grz-src | session | qodesh:Documents\green-roomz | shalom
issue: #<workstream>
until: <ISO-8601 or "until UNCLAIM">
why: <one line>
conflicts-with: <none | issue # | path>
```

**Unclaim (required on done or abort):**

```text
agent: THIS-NewBot | OTHER-Researcher-09f2d365
UNCLAIM
path: src/gateway.mjs
status: done | aborted | handed-to-integrator
evidence: <board path or test count — no invented SHA>
```

**Rules:**
- One **writer** per mutex path at a time.
- Reviews / specialists may **read** and open review comments without a claim; they **must not** patch mutex paths (fix packs go to the integrator).
- A claim older than **12 hours** with no progress comment is stale — the other team may `STEAL-REQUEST` on the coord issue; they do **not** silently take the file.
- **Never silent push-race.** Even with a claim: **no `git push`** unless the operator explicitly asks. Local commits on a claimed tree are allowed only if operator has already authorized local commits for that tree (default: **don't commit the dirty qodesh tree**).

### 4.4 Push / integrate

| Action | Who | Gate |
|--------|-----|------|
| Patch `/workspace/grz-src` | THIS integrator | Claim + `node --test` + board |
| Bounce named files to qodesh | THIS (FIX-01) or OTHER (after Agentz #2) | Claim + bounce notes; backup dir first |
| Merge `wip/council-*` | Integrator only | Operator ask + #7 then #8 |
| `git push` `main` or `host/*` | Integrator only | **Operator ask** — default **NO** |
| Vendor-copy Brainz into Roomz | **Nobody** | Roomz #10 / Agentz #3: import-by-ref only |

---

## 5. File-path mutex table

**Legend:** **THIS** = default writer while OTHER idle and after wake unless unclaimed. **OTHER** = writer on wake. **HOLD** = neither writes. **SHARED** = claim always, one writer.

| Path / glob | Default lock | OTHER on wake | Claim? |
|-------------|--------------|---------------|--------|
| `src/gateway.mjs` | **THIS** (sole integrator) | Review / fix-pack comments **only** — **no simultaneous edit** | **Always** |
| `src/routing.mjs` | **THIS** — DISPATCH-FIX-01 (box done, bounce pending) | Read; do not re-patch fallthrough | **Always** |
| `src/nexus.mjs` | **THIS** (prettify / enum filter still to bounce) | Review only | **Always** |
| `src/handoff.mjs` | **THIS** (sanitizer port) | Review only | **Always** |
| `src/mailbox.mjs` | **THIS** / Race (RACE-MAILBOX-NULL) | Review only | **Always** |
| `src/util.mjs`, `src/config.mjs` | Platform packs → **THIS** integrate | OTHER may **draft** PATH notes on Platform board | **Always** to patch |
| `src/brainz.mjs` / `GREEN_BRAINZ_ROOT` seam | **SHARED** — Roomz consumes, Agentz owns pack | No vendor-copy | **Always** |
| `src/monitor/*`, security-monitor policies | **THIS** | Review | Yes to patch |
| `bin/green-roomz.mjs`, `src/hosts/*`, `src/process-manager.mjs` | Platform → **THIS** integrate | OTHER Windows Job-Object notes welcome as boards | Yes to patch |
| `config/agents.note9.json` | **THIS** | **Stay off** | Yes |
| `config/agents.android.json` (if created) | **THIS** | Stay off unless handed | Yes |
| `docs/note9-termux.md`, `scripts/note9-*`, `scripts/note9-sync-models.ps1` | **THIS** | **Stay off** | Yes |
| Note9 **VM** guest-profile docs / recipes | **THIS** | Append dated addenda only | Yes to rewrite |
| `config/agents.windows.json`, `config/agents.windows-mvp.json` | **OTHER** | **Own** (heavy edits) | Yes — THIS stays off |
| `scripts/fetch-models.mjs`, fetch-tiny / Unicorn scripts (`scripts/unicorn.cmd`, serve Unicorn) | **OTHER** (dogfood) | **Own** | Yes — THIS strategy/docs only |
| `scripts/start-green-roomz.ps1`, `stop-green-roomz.ps1`, `switch-bench.ps1` | **OTHER** (Windows PATH-09 / SIG-02) | Own after claim | Yes |
| `C:\Users\brian\Documents\green-roomz` (whole dirty tree) | **OTHER** (Agentz #2 audit) | **First job** = read-only status/stash | **Yes** before any write; THIS bounce may copy **only** files named on FIX-01 after claim |
| qodesh `C:\LocalAI\**` model fill | **OTHER** | Own downloads when disk/online allow | Yes (large fill) |
| shalom Vulkan / LocalAI tree | **OTHER** | Own when host connected | Yes |
| `/workspace/grz-src/**` | **THIS** | Read-only | Yes if OTHER ever patches |
| `/workspace/session/green-roomz/**` | **THIS** (legacy session) | Do not treat as tip | Yes to patch |
| `/workspace/session/fleet-console/**` | **THIS** | Read; do not reinstall over THIS | Yes |
| `/workspace/reviews/release/GOAL-*.md`, `OFFLINE-SECURITY-WORKSTATION-PLAN-*.md` | **THIS** | **Append dated addenda only** — no in-place rewrite | No for new dated files; yes to edit living text |
| `/workspace/reviews/release/RELEASE-READINESS.md` | **THIS** living board | OTHER may append a dated “OTHER stand-up” section | Comment on coord issue when you touch it |
| `/workspace/reviews/{boundary,fuzz,race,platform,covert}/**` | Specialists on THIS account | OTHER reads; do not overwrite | No for new dated files |
| `wip/council-cascade`, `wip/council-quorum` | **HOLD** | Review only | Operator + claim |
| `main` pushes / `host/*` pushes | **HOLD** (integrator + operator) | Same | Operator ask |
| `brianreborn/papers` | OTHER/scholarly already theirs | Roomz **references only** (#10 — no vendor-copy) | Yes if Roomz tree would copy |
| `green-agency` | **HOLD** (Agentz #4) | Archive/lock docs only | No new work |
| Knowledge-library board + `knowledge-approval-matrix.html` | **THIS** | Do not entangle into download freeze | Yes to rewrite |
| Image-matrix recipes (FreeBSD / Debian-class / HardenedBSD × host + Note9 VM) | **THIS** | godslove #5 adapters when box exists | Yes |

**FIX-01 exception (narrow):** THIS may copy `/workspace/grz-src/routing.mjs` (+ tests if listed) onto qodesh `src\` **after** Agentz #2 has at least a read-only status note **or** operator green-lights bounce. Still: backup dir, **no whole-tree overwrite**, no push.

---

## 6. Sync cadence

### 6.1 When only THIS is live (current)

- Daily **or** at each major claim/unclaim: one comment on the **coord** issue (`STILL-LIVE` template).
- No need to ping an idle Researcher.

### 6.2 When **both** are live

Stand-up = **one comment on the coord issue every 4 hours** (wall clock, America/Los_Angeles if operator is in that zone; otherwise UTC — state the zone).

Skip a slot only with `SKIP-STANDUP reason=…` so the other team does not assume a crash.

**Stand-up comment template:**

```text
agent: THIS-NewBot | OTHER-Researcher-09f2d365
STANDUP <YYYY-MM-DDTHH:MMZ | PT>
zone: America/Los_Angeles | UTC

claims-held:
- path: …  issue: #…  until: …

done-since-last:
- …

next-4h:
- …

blocked:
- …

will-not-touch:
- <mutex paths left to the other team>

push: none | waiting-operator
quota: unknown | operator-supplied <note>
```

### 6.3 Event comments (do not wait for the 4h slot)

| Event | Comment tag |
|-------|-------------|
| OTHER first message after idle | `WAKE` + “handoff packet read” |
| Operator posts usage UI / usual reset | `RESET-ETA` (quote operator; do not infer) |
| Starting a mutex edit | `CLAIM` |
| Finished / aborted | `UNCLAIM` |
| Want a file someone else holds | `STEAL-REQUEST` (wait for ACK) |
| Bounce / test result | `BOUNCE` + board path |
| Operator asked for a push | `PUSH-REQUEST` on coord **and** workstream — still wait for explicit ask in that thread |

---

## 7. First 48 hours after OTHER wakes

Clock starts at OTHER's `WAKE` comment, not at a guessed quota hour.

### T+0 → T+1h — protocol only

| Who | Does | Does not |
|-----|------|----------|
| **OTHER** | Read packet §3. Post `WAKE` on coord issue. Post read-only intent on **Agentz #2** + **Roomz #4**. ListMachines: qodesh / shalom connectivity only | Edit `src/gateway.mjs` / `routing.mjs` / note9 files / image-matrix plans in-place |
| **THIS** | ACK the wake. Publish current claim table. Continue image-matrix / knowledge-lib / fleet-console / Note9 VM **docs**. Keep FIX-01 claim on `routing.mjs` | Start a new gateway rewrite in the same hour |

### T+1h → T+8h — split lanes

| Who | Work |
|-----|------|
| **OTHER** | **Agentz #2** live `git status -sb` + stash **audit** of `C:\Users\brian\Documents\green-roomz` (report on the issue; **do not reset/commit**). If shalom connects: inventory disk / Vulkan / existing LocalAI — **downloads only after a claim** on the windows-shalom workstream. Roomz #4 notes. |
| **THIS** | Remaining dispatch P0s **in integrate order** (RELEASE-READINESS): (1) FIX-01 bounce when qodesh sticks — **after** OTHER's audit note or operator greenlight; (2) vision-first / `|after:vision` prettify (`nexus.mjs` — claim first); (3) null-body fast 400 (Race + gateway edge — claim `gateway.mjs`); (4) slash modality (BND-03). Parallel: 3-OS recipe drafts, Note9 VM guest profiles, knowledge-lib (out of freeze), fleet-console deploy **on hosts THIS already owns**. |

### T+8h → T+24h

| Who | Work |
|-----|------|
| **OTHER** | Windows / shalom **fill** per `MODEL-PACK-INVENTORY` (strategy already THIS-written; do not invent GGUF names). Unicorn / fetch-models dogfood on `eb4a9f7`. Agentz #10 runner spike as a **branch/board**, not a `main` push. Stay off note9 scripts. |
| **THIS** | Continue dispatch integrate **one claimed file at a time**. Image-matrix cells (Debian-class / FreeBSD / HardenedBSD × workstation + Note9 VM). Phone Issue #2 only if device path exists (USB+adb from qodesh — operator Allow). |

### T+24h → T+48h

| Who | Work |
|-----|------|
| **Both** | At least **two** 4h stand-ups actually posted. Reconcile: which dispatch P0s bounced live vs box-only. THIS proposes next integrator slice; OTHER proposes download checksum gaps (**TBD**, not invented hashes). |
| **Joint** | Brainz seam smoke **if** pack present (`GREEN_BRAINZ_ROOT`) — claim the seam. Council #7/#8 stay HOLD. |
| **Neither** | `git push`; council merge; whole-tree overwrite; GGUF on qodesh **8600 GT**; `green-fleetz` repo; in-place rewrite of the other's plans. |

### 48h exit (success)

- Coord issue has wake + ≥2 dual stand-ups + a current claim table
- Agentz #2 has a **dated status** (dirty/clean/stash) — not necessarily clean
- FIX-01 either bounced live or still blocked with a fresh reason (no silent “it's landed on main”)
- No dual writers on `gateway.mjs`
- Image-matrix and knowledge-lib still THIS; Windows downloads still OTHER
- **Zero pushes** unless operator asked in writing on the issue

---

## 8. Current claim snapshot (THIS, 2026-09-12, pre-wake)

| Path | Holder | Status |
|------|--------|--------|
| `/workspace/grz-src/routing.mjs` | THIS — DISPATCH-FIX-01 | Box ACCEPT 15/15; **no SHA**; qodesh bounce **pending** (`_bounce-backup-20260912\routing.mjs.from-box`) |
| `/workspace/grz-src/gateway.mjs` | THIS integrator, **unlocked for new writes** | Unchanged by FIX-01 — **claim before next edit** |
| `src/nexus.mjs` / `handoff.mjs` | THIS default | Unchanged by FIX-01; prettify not bounced live |
| `config/agents.note9.json` + `scripts/note9-*` | THIS | Client + VM docs; OTHER stay off |
| `/workspace/session/fleet-console/*` | THIS | Pack present; deploy not a qodesh-tree reset |
| `config/agents.windows.json` / fetch-models / Unicorn | **Reserved OTHER** | THIS not holding a write claim |
| qodesh `Documents\green-roomz` | **Reserved OTHER** (Agentz #2) | THIS bounce = named files only |
| `wip/council-*` / `main` push | HOLD | Operator |

---

## 9. Document control

| Field | Value |
|-------|-------|
| Created | 2026-09-12 |
| Method | Existing boards + operator dual-team rules only |
| Explicitly not used as fact | Quota reset time; invented SHAs; invented new GitHub issue numbers; inverted host-ahead narrative |
| Coord issue number | **TBD** — paste from `GH-ISSUE-DRAFT-dual-team-coord.md` |
| Living freeze | `/workspace/reviews/release/RELEASE-READINESS.md` |


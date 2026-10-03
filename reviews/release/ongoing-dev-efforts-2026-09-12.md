# Ongoing Green-* development efforts — 2026-09-12

**Catalog date:** 2026-09-12 (UTC)  
**Method:** public GitHub HTML + REST (when not rate-limited) + `git ls-remote` / bare clones of public remotes. Local-exec on qodesh `19f2c19e-e100-49f0-8507-813d66727973` was **not available to this executor** (no ListMachines/local-exec tool in this subagent).  
**Rule:** no invented PRs, issues, SHAs, or branches. Unverified local dirty/clean is labeled as such.

**Accounts checked**

| Account | Public identity | Public repos | green-* owned |
|---------|-----------------|--------------|---------------|
| [brianreborn](https://github.com/brianreborn) | Brian Fundakowski Feldman; X `born_brian85001` | 18 | `green-roomz`, `green-agentz`, `green-agency` |
| [electrobrian](https://github.com/electrobrian) | “Brian (just another of God's lambs)”; same X handle | 4 | **none** (no `green-roomz` / `green-agentz` / `green-agency` fork — `git ls-remote` 401/missing) |

**Repos that do not exist as public GitHub projects:** `green-zkillz`, `green-brainz`, `green-fleetz`, `fleet-bootstrap` (the last is a **folder** in `brianreborn/papers`). Zkillz/Brainz live **inside** `green-agentz`. Agentz #6 is an official hold: do not create `green-fleetz`.

**Distinct efforts counted below:** **27** (independent issue, branch, release, paper track, host track, or local tree). Stale leftover `feature/kernel-faith` (already merged, 0 unique commits) is listed under leftovers, not counted.

---

## 1. Executive map

| # | Effort | Account / repo | Status | Primary SHA / branch / issue |
|---|--------|----------------|--------|------------------------------|
| 1 | Roomz `main` beta (models, fetch, TTS, security slash, Unicorn, UAT) | brianreborn/green-roomz; **pushed as electrobrian** | Active tip | `main` `eb4a9f74bef93c2792c34041a03a0d33eb0f9e5f` (2026-09-07 21:08 -0700) |
| 2 | Vision / treasury-test-label-scanner | green-roomz | Open; 503 fix on `main`; VL perf still open | **#1**; tip of host markers `260db2ab93dfbc2c368375476675cd315f04cccf` |
| 3 | host/note9 Termux bring-up | green-roomz | Open; remote branch **42 behind** `main` | **#2**; `host/note9` = `260db2a` |
| 4 | host/pixel8 KernelSU bring-up | green-roomz | Open; same stale tip as note9 | **#3**; `host/pixel8` = `260db2a` |
| 5 | host/qodesh degraded Windows CPU | green-roomz | Open; branch 15 behind `main`, 0 unique | **#4**; `host/qodesh` = `1d8bbb9ffd9b978b1912eb4b4af9bdd8d088f0e5` |
| 6 | host/godslove FreeBSD / PQFreeBSD | green-roomz (+ pqfreebsd) | Open; same stale tip as note9 | **#5**; `host/godslove` = `260db2a`; OS repo `pqfreebsd` `449635c` |
| 7 | host/shalom live Vulkan GRZ | no remote `host/shalom` | Live historically; laptop offline to this box 2026-09-11 | Issue **#1** env; LocalAI legacy `d99e2d3` cited on Agentz **#2** (not a public remote ref) |
| 8 | `/skill` `/zkill` host load | green-roomz | Open | **#6** (comments 2026-09-07) |
| 9 | Council cascade / escalate | green-roomz | Implemented, **unmerged**, awaiting review | **#7**; `wip/council-cascade` `7414812b50a113cfb1bfd6685c94ad2f727855b8` |
| 10 | Council N-of-M quorum | green-roomz | Implemented stacked on #7, **unmerged** | **#8**; `wip/council-quorum` `727d3442710974920b27482ccbb22524d19ad5cb` |
| 11 | Offline council/stock-prompt tracker | green-roomz | Open tracker | **#9** (`9ad6d6b..445e5ad` already on `main`) |
| 12 | Import green-brainz by reference | green-roomz + green-agentz | Partial land; not live on :8080 | Roomz **#10**; Agentz **#3**; Roomz import SHA `1d8bbb9` |
| 13 | Agentz main / zkillz 0.1.0-alpha pack | brianreborn/green-agentz | Prerelease published | `main` `1b8933e53f9c621ed6d0826c4991ac440af2f159`; tag `green-zkillz-v0.1.0-alpha` = `a564c10eaf8ba26b6ad93c6b8f8b2e2807c9dc53` |
| 14 | green-etioz founding charter | green-agentz | **Only open PR in the constellation** | **PR #1** / issue #1; branch `skill/etioz` `7df4764c8a76459c35d7bfa64b8a06a75da726cc` |
| 15 | Host/workspace reconciliation ledger | green-agentz | Open; qodesh Roomz still dirty as of 2026-09-07 | **#2** |
| 16 | Retire public `green-agency` identity | green-agentz / green-agency | Repo README redirects; archive/lock still open | Agentz **#4**; agency `main` `6a4e0d7` |
| 17 | VCS baseline as Zkillz preflight | green-agentz | Blocked on #2 | **#5** |
| 18 | green-fleetz hold (do not create repo) | green-agentz | Official non-work | **#6** |
| 19 | Reserve Green-Shepherdz extraction | green-agentz | Reserved for joint review | **#7** |
| 20 | MFL phases on Dreamcatcher | green-agentz | Module landed `60f3af5`; loop still open | **#8** |
| 21 | IRQ trusted plane ≠ public :8080 | green-agentz | Open | **#9** |
| 22 | Windows runner for bash zkillz scripts | green-agentz | Open | **#10** |
| 23 | Alpha pack follow-ups | green-agentz | Open | **#11** |
| 24 | Quality eval vs raw-llama / cloud | green-agentz | Suite landed `741ca71`; issue open | **#12** |
| 25 | Try-out cookbook | green-agentz | Open | **#13** |
| 26 | Host nap / green-dreamz vs Grok compact | green-agentz | CognitiveHost landed `cd78e4c`; Grok window still unowned | **#14** |
| 27 | papers fleet-bootstrap + scholarly MFL / continuum / Dreamcatcher | brianreborn/papers | Active papers; bootstrap scripts present | `main` `2d5c481`; fleet-bootstrap added in `59a25d1` |

**PRs that exist (do not invent more):**

| Repo | Open PRs | Closed PRs |
|------|----------|------------|
| brianreborn/green-roomz | **0** | **0** |
| brianreborn/green-agentz | **1** (`#1` etioz) | none listed |
| brianreborn/green-agency | **0** | **0** |
| electrobrian/* green | n/a (no green repos) | n/a |

---

## 2. Per-repo detail

### 2.1 `brianreborn/green-roomz`

- **Desc:** Local llama.cpp Vulkan/CPU agent gateway  
- **Created:** 2026-08-28 · **Last push:** 2026-09-08T04:08:17Z · **Default:** `main`  
- **Open issues:** 10 (#1–#10, all open). **Closed issues:** none listed.  
- **Releases:** none.  
- **Archive tags (not product releases):**
  - `archive/main-pre-reconcile-2026-08-29` → `eda3d5b` (annotated; peeled `023966e`)
  - `archive/master-2026-08-29` → `99b0cbb` (peeled `35bee28`)
  - `archive/master-localai-2026-08-29` → `f18f25f` (peeled `d99e2d3`)
- **Forks:** 0 (API `forks_count: 0`; no electrobrian fork).

#### Remote branches (`git ls-remote` 2026-09-12)

| Branch | Full SHA | vs `main` | Unique work |
|--------|----------|-----------|-------------|
| `main` | `eb4a9f74bef93c2792c34041a03a0d33eb0f9e5f` | tip | — |
| `host/qodesh` | `1d8bbb9ffd9b978b1912eb4b4af9bdd8d088f0e5` | 15 behind / 0 ahead | none (stale pointer onto `main` history) |
| `host/note9` | `260db2ab93dfbc2c368375476675cd315f04cccf` | 42 behind / 0 ahead | none |
| `host/godslove` | `260db2ab93dfbc2c368375476675cd315f04cccf` | same as note9 | none |
| `host/pixel8` | `260db2ab93dfbc2c368375476675cd315f04cccf` | same as note9 | none |
| `wip/council-cascade` | `7414812b50a113cfb1bfd6685c94ad2f727855b8` | 17 behind / **1 ahead** | `feat(council): cascade / escalate (#7)` |
| `wip/council-quorum` | `727d3442710974920b27482ccbb22524d19ad5cb` | 17 behind / **2 ahead** | #7 + `feat(council): N-of-M quorum with early cancel (for #8)` |
| `feature/kernel-faith` | `cee2c39ecc758bfa3acf1011a93a93b847f6a9d8` | 57 behind / 0 ahead | leftover; already merged |

**Correction:** older stand-up boards said “`host/note9` 42 ahead of `main`”. GitHub compare `host/note9...main` is `status: ahead, ahead_by: 42, behind_by: 0` — meaning **`main` is 42 ahead of the host branch**. Host tips are ancestors of `main`.

**No `host/shalom` remote branch.**

#### Open issues (all `state: open`, author `brianreborn`)

| # | Title | Opened | Notes from issue body / comments |
|---|-------|--------|----------------------------------|
| 1 | Wire treasury-test-label-scanner to vision-layout-agent | 2026-08-30 | SHALOM env; 503 fix on `260db2a` / `5cdd03c`. Comment claims live scanner PASS via `584d2b9` — **that SHA is not on the public remote** (clone `rev-parse` failed). Perf ~100s/label still open. |
| 2 | host/note9: bring up… (SM-N960U, SDM845, Android 10, no root) | 2026-08-30 | Checklist all unchecked. Serial `27841130ae1c7ece`. Measured 23.8 tok/s. |
| 3 | host/pixel8: Tensor G3, KernelSU | 2026-08-30 | Checklist unchecked; no measured tok/s. |
| 4 | host/qodesh: degraded (Athlon II, 8600 GT, ~3 tok/s) | 2026-08-30 | Vulkan dead; CUDA 6.5 installer must not run on Win11. |
| 5 | host/godslove: FreeBSD 15 (PQFreeBSD), i7-620M | 2026-08-30 | Needs `freebsd.mjs` / `agents.freebsd.json`. Refs `docs/fleet-targets.md`. |
| 6 | skill/compat: `/skill` and `/zkill` | 2026-08-30 | Points at Agentz PR #1 / Roomz #10. Comment 2026-09-07: alpha published; Brainz not on :8080. |
| 7 | council: cascade / escalate | 2026-08-30 | Implemented `7414812`; 267 tests; **not merged**. |
| 8 | council: N-of-M quorum | 2026-08-30 | Comment cites `de2ce15` — **that SHA is not on the remote**. Current tip is `727d344`. Merge order #7 then #8. |
| 9 | tracking: offline council/stock-prompt (2026-08-30) | 2026-08-30 | `main` already has `9ad6d6b..445e5ad`. WIP #7/#8 unmerged. |
| 10 | Import green-brainz by reference | 2026-09-07 | Partial: `1d8bbb9` adds `src/brainz.mjs` + `GREEN_BRAINZ_ROOT`. UAT `e7c895e`. Still open until live :8080. |

#### Recent `main` commits (last 17 on Sep 7 = electrobrian noreply identity)

Author `Brian (just another of God's lambs) <95530893+electrobrian@users.noreply.github.com>` — GitHub user **electrobrian** (id 95530893):

| SHA | Subject |
|-----|---------|
| `eb4a9f7` | feat(fetch): add fetch-models.mjs … and make-moderation harness |
| `c529ce4` | feat(models): embedding, reranking, moderation, image generation harnesses |
| `a152bd0` | feat(tts): festival/flite; optimize note9 and windows profiles |
| `9889493` | feat(security): security slash, wrong-tool handoffs, activity watchdog |
| `62ac7de` | Getting a little closer to full beta functionality. |
| `a3d05a0` | fix(unicorn): parse JSON completions so stream:true is not (empty) |
| `8676f4c` | fix(unicorn): ASCII-only launcher for Windows PowerShell 5 |
| `ff117b1` | feat(serve): restore Unicorn web/file-drop next to chat-mvp |
| `5a336ac` | fix(serve): retry stock-prompt prime; UAT chat 7/7 live |
| `91bfcbb` | fix(serve): prime Instruct with the compiled stock prompt |
| `8a431a2` | fix(uat): 10min chat deadline |
| `f31a008` | test(iterate): session memory, GET /, live e2e |
| `954eebe` | docs(serve): name chat-mvp on GET / |
| `d0b261b` | feat(session): persist working set as jsonl |
| `e7c895e` | test: live UAT and automated e2e are both ship gates |
| `1d8bbb9` | feat: operator GET /, Brainz import, session working-set injection |
| `0336d76` | Land Windows MVP dogfood: health_aliases, chat_default, coding agent. |

Earlier `main` (Aug 29–30) is stock-prompt / council / lifecycle, author name **Brian Fundakowski Feldman** `<brianfundakowskifeldman@gmail.com>`, but GitHub **author.login is still `electrobrian`** on the compare API (electrobrian is the pusher/committer account on this repo). Co-author Claude Sonnet 5 on many of those.

`main` has **102** commits since 2026-08-13. Last 40 authors: 23 Feldman-email + 17 electrobrian-noreply.

Cited historical SHAs that **do** exist on the remote: `381491c` (2026-08-28, slash/sanitizers), `260db2a`, `5cdd03c`, `1d8bbb9`.  
Cited in boards/issues but **not on public remote:** `584d2b9` (#1 comment), `4b5e6ad` (old RF4 board), `de2ce15` (#8 comment).

`docs/fleet-targets.md` (on `main`) names godslove as PQFreeBSD 15. `deploy/shalom/README.md` references `parallel-fleet-bootstrap.ps1`. Security-monitor frames mention “Future sites (CUDA mapped ring, PQFreeBSD MAC)”.

---

### 2.2 `brianreborn/green-agentz`

- **Desc:** Integration tree: green-roomz runtime + green-zkillz skills + green-brainz microkernel  
- **Created:** 2026-08-29 · **Last push:** 2026-09-07T13:37:02Z  
- **Open issues count:** 14 (issues #1–#14 all open; **#1 is also the open PR**)  
- **Closed issues:** none listed.

#### Branches / tags

| Ref | SHA | Note |
|-----|-----|------|
| `main` | `1b8933e53f9c621ed6d0826c4991ac440af2f159` | 2026-09-07 06:36 -0700 |
| `skill/etioz` | `7df4764c8a76459c35d7bfa64b8a06a75da726cc` | 14 behind / **1 ahead** of `main`: `skills/etioz: add green-etioz founding charter (draft, awaiting ratification)` |
| tag `green-zkillz-v0.1.0-alpha` | `a564c10eaf8ba26b6ad93c6b8f8b2e2807c9dc53` | GitHub prerelease 2026-09-07 08:47; zip `green-zkillz-0.1.0-alpha.zip` |

#### Only PR

**PR #1** — `skills/etioz: green-etioz founding charter (draft)`  
Opened 2026-08-30 by brianreborn. +1192 −0 in 4 files. Merge commit listed as `46441ee` (not merged to `main`; branch still `skill/etioz`). Relates to Roomz #6.

#### Open issues

| # | Title | Status snapshot |
|---|-------|-----------------|
| 1 | skills/etioz founding charter | Same body as PR #1; draft awaiting ratification |
| 2 | Reconcile ignored, untracked, and host-local artifacts | Active ledger. Shalom canonical published at `5833e61`. **Qodesh `C:\Users\brian\Documents\green-roomz` called a separate dirty checkout (comment 2026-09-07).** Agentz clone on qodesh at `a564c10`. Private `brianreborn/green-agency-session-2026-08-26` mentioned (not public; not re-fetched). LocalAI at `d99e2d3` on `host/shalom-deployed-legacy` (not a public remote). |
| 3 | Wire zkillz 0.1.0-alpha into live Roomz (no tree copy) | Partial: Agentz `cd78e4c` + Roomz `1d8bbb9`. Live :8080 still needs `GREEN_BRAINZ_ROOT`. |
| 4 | Finish retiring public green-agency identity | Archive/lock repo; dispose private session repo/bundle |
| 5 | Inherit VCS baseline as Zkillz preflight (after #2) | Blocked on #2 |
| 6 | green-fleetz is a planning name only | **Do not create repo/runtime** |
| 7 | Reserve Green-Shepherdz (Sentinel / Council / Warden) | Joint review; out of alpha |
| 8 | Implement MFL phases on Dreamcatcher | Module `60f3af5` landed; store ≠ loop |
| 9 | IRQ trusted control plane must not be public :8080 | Open (IRQ-9) |
| 10 | Zkillz skill scripts are bash — Windows runner | Open |
| 11 | Alpha pack follow-ups (title, zip, Node 20) | Open |
| 12 | Quality comparison eval | Suite `741ca71` |
| 13 | Try-out cookbook | Open |
| 14 | Host must nap into green-dreamz; Grok compact is fugue | CognitiveHost `cd78e4c` (6/6 tests); Grok window still unowned |

#### Recent `main` (electrobrian noreply)

`1b8933e` UAT/e2e gates · `cd78e4c` CognitiveHost impress + green-dreamz nap · `387d8a3` compact-as-impress docs · `aedbb83` try-out / dream vs fugue · `741ca71` eval suite · `60f3af5` MFL phases · `a564c10` release target_commitish · `27dbf98` / `65fd492` pack + install-by-path (no Roomz copy).

Authors across all Agentz refs: electrobrian-noreply 41, Feldman-gmail 34, Brian Reborn `<brianisbornagain@gmail.com>` 29, “Brian (reconcile)” `<tatumvjohnson@gmail.com>` 9.

---

### 2.3 `brianreborn/green-agency`

- **Desc:** Baseline /skills for modernizing agents — **retired**; last commit redirects to green-agentz.  
- **Last push:** 2026-08-30T21:18:31Z  
- **Branches:** `main` only = `6a4e0d7a64646310485615ae5ecf917fbbf36aed`  
- **Tag:** `v0.1.0-alpha` = `83866c9` (“Add gh CLI alpha release script…”)  
- **Issues:** 0 open. **PRs:** 0 open / 0 closed.  
- Agentz #4 still wants this repo archived/locked. Do not open new work here.

Recent: `6a4e0d7` redirect · `ecf7411` gdict OpenMetrics · then Aug 26 rebrand-to-zkillz series (Brian Reborn / `brianisbornagain@gmail.com`).

---

### 2.4 `brianreborn/papers` (referenced from Roomz / Agentz)

- **Last push:** 2026-09-05T22:26:07Z · `main` `2d5c48107ed92f35d8ee7c99f02906a776aa2063`  
- **Issues / PRs:** 0 open. **Branches:** `main` only.  
- **fleet-bootstrap/** added in `59a25d191e689794c9a36525df8f2f6a24c3a483` (2026-08-29):
  - `fleet-bootstrap/agents-bootstrap.json`
  - `fleet-bootstrap/parallel-fleet-bootstrap.ps1`
  - `fleet-bootstrap/qodesh-startup.ps1`
- Also: `cognitive-architecture/` (Dreamcatcher / COGNITIVE_REQUIREMENTS), `memory-like-trait-inheritance/`, `continuum-aerosol-computing/`.  
- Roomz `deploy/shalom/README.md` names `parallel-fleet-bootstrap.ps1`.

---

### 2.5 `brianreborn/pqfreebsd` (+ kernel, + freebsd-mac-grok)

Referenced from Roomz **#5** (godslove OS = FreeBSD 15 / PQFreeBSD) and Roomz monitor docs.

| Repo | Tip | Last push | Issues | Branches |
|------|-----|-----------|--------|----------|
| pqfreebsd | `449635caed59a8c5b484119e8cb7e606550a6fde` “status: inventory implemented vs inherited vs workbench vs held” | 2026-09-05 | 0 | `main` only |
| pqfreebsd_kernel | `b329201f6c6fa944018dd9af31042332297d90ac` | 2026-08-23 | 0 | `main` |
| freebsd-mac-grok | `253a385eeca5bbad5b7a618438f4dade612aa9e3` | 2026-08-22 | 0 | `main` |

No `green-roomz` / `godslove` / `fleet` commits in pqfreebsd log (grep empty). Link is **issue/docs**, not shared git history.

---

### 2.6 electrobrian’s own public repos (not green-*)

| Repo | Kind | Last push | Open issues | Relation |
|------|------|-----------|-------------|----------|
| electrobrian/bible-reconstruction | fork of brianreborn | 2026-08-22 | 5 | unrelated |
| electrobrian/japanglify | fork of brianreborn | 2026-08-20 | 7 | Agentz #6 mentions Japanglify/swarm only as future fleetz mapping |
| electrobrian/jargon-juggler | own | 2024-02-08 | 0 | unrelated |
| electrobrian/electrobrian | profile README | 2021-12-04 | 0 | unrelated |

**No electrobrian fork of green-roomz / green-agentz / green-agency.** Cross-account work is **direct pushes** to `brianreborn/*` as collaborator (GitHub `author.login: electrobrian` on Roomz commits; recent commits use electrobrian noreply email).

---

### 2.7 Local / box / qodesh signals

#### This box (`/workspace`)

| Tree | Git? | Note |
|------|------|------|
| `/workspace/session/green-roomz` | **not a git repo** | Older session drop; tests historically 75/75 |
| `/workspace/grz-src/` | not a repo | Patch drop (`gateway/handoff/nexus/routing/util.mjs`) dated 2026-08-28 |
| `/workspace/reviews/**` | n/a | Dual-team boards (boundary/platform/race/covert/release) |

#### qodesh `19f2c19e-e100-49f0-8507-813d66727973` — `C:\Users\brian\Documents\`

**Live `git status -sb` / `stash list` was not run this pass.** This executor has no ListMachines/local-exec surface.

Last **recorded** evidence (do not treat as live):

| When | Source | Claim |
|------|--------|-------|
| 2026-09-07 | Agentz **#2** comment | `C:\Users\brian\Documents\green-agentz` at published `a564c10` / tag `green-zkillz-v0.1.0-alpha`. `C:\Users\brian\Documents\green-roomz` remains a **separate dirty checkout**; host audit still required. |
| 2026-09-07 | Agentz **#2** body | Shalom `Documents\green-roomz` also a separate checkout with ignored cutover evidence (`verify-cutover.json`, serve/verify logs). |
| 2026-09-11 ~17:25 PT | `/workspace/reviews/forensic-fleet-heartbeat-2026-09-11.md` | qodesh **connected**; tree present (dirs last written Sep 6–9 PT); **serve DOWN** (`:8080`/`:8187` no LISTEN; no `node.exe`). |

**Cannot assert current dirty/clean or stash contents.** Report: **last known dirty (2026-09-07); live status unknown 2026-09-12.**

#### Other hosts (from issues + forensic board)

| Host | Remote branch | Machine registry (this account, 2026-09-11) | Issue |
|------|---------------|---------------------------------------------|-------|
| note9 | `host/note9` @ `260db2a` | not registered | #2 |
| qodesh | `host/qodesh` @ `1d8bbb9` | `19f2c19e-…` connected | #4 |
| godslove | `host/godslove` @ `260db2a` | not registered | #5 |
| pixel8 | `host/pixel8` @ `260db2a` | not registered | #3 |
| shalom | **no `host/shalom`** | `801f51e6-…` **not connected** | #1 live env |

---

## 3. Overlaps / collision risks with dual SuperGrok teams

Two SuperGrok teams share the same public `brianreborn/green-roomz` + `green-agentz` remotes. electrobrian is the **GitHub pusher** on recent Roomz/Agentz `main`; brianreborn owns the repos and issues.

| Collision | Why it is real | Mitigation |
|-----------|----------------|------------|
| **`main` tip is electrobrian-only since `0336d76` (Sep 7)** | Other team integrating sanitizers / note9 on stale mental model (`host/note9` “42 ahead”, `381491c`, `4b5e6ad`) will fight `eb4a9f7` | Treat `eb4a9f7` as canonical remote; host/* are **behind**, not ahead |
| **`src/gateway.mjs` / routing / council** | This team’s boundary packs + other team’s Unicorn/models/council WIP (`wip/council-*` unmerged) | One integrator; do not merge #7/#8 during note9 UAT unless needed |
| **`config/agents.note9.json` vs `agents.windows.json`** | note9 cut vs qodesh/Windows MVP (`0336d76`, `a152bd0` touches **both** note9 and windows profiles) | Path ownership: note9 files vs windows manifest |
| **Brainz import (`GREEN_BRAINZ_ROOT`, Roomz #10 / Agentz #3)** | Both teams can “land” import-by-ref and vendor-copy by accident | Import only; no tree copy. Agentz owns Brainz; Roomz consumes |
| **qodesh `Documents\green-roomz` dirty working copy** | Uncommitted local state (last known 2026-09-07) + remote `host/qodesh` 15 behind | Other team owns Windows polish; this team must not reset/commit that tree without audit (#2) |
| **No public PRs on Roomz** | All integration is straight-to-`main` or unreviewed `wip/*` | Dual teams can push-race `main` if both get write |
| **Issue #1 comment SHA `584d2b9` missing on remote** | Possible shalom-local-only commit | Do not cite as landed on `main` |
| **green-agency vs green-agentz** | Retired repo still public and unarchived (#4) | No new agency work; identity cleanup is other-team/docs |
| **Box session tree vs GitHub `main`** | `/workspace/session/green-roomz` + `grz-src` are Aug 28 drops, not `eb4a9f7` | Do not treat box session as ship tip |
| **Quota / idle other Researcher `09f2d365-…`** | Other-account agents exist and may wake | Boards under `/workspace/reviews/`; no silent `git push` |

---

## 4. Recommended ownership split

**This team (note9 integrate + ship; this SuperGrok / box reviews):**

- Roomz **#2** / `host/note9` fast-forward **onto** `main@eb4a9f7` (local only; no push unless operator asks).
- Boundary / capability / monitor-reject / peer-allowlist **design** for note9 (`9889493` already on `main`).
- Consume Agentz via `GREEN_BRAINZ_ROOT` (Roomz **#10**) — do not vendor-copy.
- Stay off `config/agents.windows.json` heavy edits, Unicorn/fetch-models dogfood, and qodesh dirty working copy.
- Do not merge `wip/council-*` during the note9 cut unless operator asks.
- Do not create `green-fleetz` / `green-zkillz` / `green-brainz` repos (Agentz #6; those names are in-tree).

**Other account team (electrobrian-pushed `main`, Windows / shalom):**

- Roomz **#4** qodesh degraded + **live `git status -sb` / stash audit** of `Documents\green-roomz` (Agentz #2 still open).
- Shalom Vulkan / vision **#1** remaining perf + any local-only SHA (`584d2b9`).
- Unicorn / models / fetch-models / Windows MVP already on `eb4a9f7` — keep owning that tip.
- Agentz pack nits **#11**, Windows zkillz runner **#10**, agency archive **#4**, reconciliation **#2**.
- Council **#7/#8** review/merge **after** note9 UAT (issue #9 merge order).
- pqfreebsd / godslove **#5** when that box exists.
- papers fleet-bootstrap / scholarly — they already land as `brianreborn/papers`; Roomz only references.

**Shared / joint (do not dual-edit):**

- `src/gateway.mjs`, council fan-out, Brainz import seam, `main` pushes.
- Agentz **#7** Shepherdz extraction, **#14** Grok-nap — design reviews, not parallel implementations.

---

## 5. Source log (what was and was not obtained)

| Source | Result |
|--------|--------|
| `https://api.github.com/users/{brianreborn,electrobrian}` + `/repos` | OK |
| `git ls-remote` + bare clone of roomz/agentz/agency/papers/pqfreebsd | OK — all SHAs/branches above |
| GitHub issues/PR HTML (WebFetch) | OK — #1–#10 roomz, #1–#6/#14 agentz, PR #1, releases |
| GitHub compare `host/note9...main` | OK — ahead_by 42 |
| Unauthenticated REST burst | Rate-limited / abuse-detect after first wave; clones used instead |
| `gh auth` | not logged in |
| electrobrian green forks | 404 / `git ls-remote` failed (repo absent) |
| qodesh live `git status -sb` / `stash list` | **not run** (no machine-exec in this executor) |
| Private `brianreborn/green-agency-session-2026-08-26` | cited on Agentz #2 only; not fetched |

---

*End of catalog. 27 distinct efforts. File: `/workspace/reviews/release/ongoing-dev-efforts-2026-09-12.md`*

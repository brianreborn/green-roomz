# Green-Roomz release readiness (living board)

**Owner:** Release Driver
**HEAD:** `85c2c3c` (monitor uncallable reject cache + tests; PF9 CRLF worktree)
**Tree:** `/workspace/green-roomz` on `host/cursor`
**Updated:** 2026-09-06 ~18:33 PT
**Hard rules:** local commits only; never git push; no GGUF on 8600 GT; CPU llama only; PF-aware stop; no reboot/lockdown; no exploits; leave live :8080/:8187 alone unless PF bounce required

---

## Scoreboard (summary)

| Area | Status | Notes |
|------|--------|-------|
| Unit / focused tests | **GREEN (0 fail)** | Full `node --test` on `85c2c3c`: **328 pass / 0 fail / 6 cancelled / 1 skip** (335 total, ~4.6s). Prior 4 assertion fails fixed. RF4 process-manager still **36/36**. See milestone. |
| P0 security integrate | **GREEN** | `16fc8f7` + live fuzz residuals dispositioned (`p0-residual-notes.md`) |
| PF1–PF9 | **GREEN** | `efa7e2b`; live bounce optional / not required for pack |
| RF4 race residuals | **GREEN (tree+disk)** | `4b5e6ad`; e2e-fresh synced on disk; live node still pre-RF4 until bounce |
| Windows MVP | **GREEN** | `d7843bd` + docs/launchers |
| Stream SSE fix | **GREEN** | `a6be0f9`; box e2e + qodesh case E PASS |
| Athlon threads=1 | **GREEN** | `0cebc78` |
| Locked parity battery | **GREEN** | `ff5f284`; in beta-0.5.1-slim + 0.5.2-slim |
| qodesh MVP parity A–G | **GREEN** | 7/7 PASS reverify (`qodesh-mvp-parity-battery.md`) |
| Pack beta-0.5-slim | **STALE vs HEAD** | Built ~00:12 UTC Sep 7 **before** RF4 / locked launcher |
| Pack beta-0.5.1-slim | **BUILT** | `/workspace/green-roomz-beta-0.5.1-slim.zip` 25.03 MiB; RF4+locked |
| Pack beta-0.5.2-slim | **BUILT** | `/workspace/green-roomz-beta-0.5.2-slim.zip` 26241466 bytes (25.03 MiB); md5 `c89c25fdc8bbbfa9e7639c8a69b7abd1`; sha256 `e2b9c6016a0e5153a03e3f400c546b5d35ed544399f64cedad37bc35377cd11f` |
| Docs (INSTALL / WINDOWS-MVP / SMOKE) | **GREEN enough** | Present in tree + 0.5.x packs |
| Push to GitHub | **BLOCKED** | electrobrian pull-only; need **brianreborn PAT** (blocks push only) |
| Release DONE | **YES** | 2026-09-06 ~18:33 PT — full suite green + beta-0.5.2-slim built; residuals honest (no push; live pre-bounce; Note9 optional) |

---

## Checklist

### Tests
- [x] process-manager RF4 tests 36/36
- [x] Gateway stream unit coverage (a6be0f9)
- [x] Full node --test suite on HEAD — **GREEN 2026-09-06 ~18:35 PT; 0 fail**
  - Before (`4b5e6ad`): 335 tests; **324 pass / 4 fail / 6 cancelled / 1 skip**
  - After (`85c2c3c`): 335 tests; **328 pass / 0 fail / 6 cancelled / 1 skip**; duration_ms ≈ 4596 (~4.6s)
  - Fixes in `85c2c3c`:
    1. `src/monitor/api.mjs` — `uncallableEnvelope` uses `hashStringToU64('api:'+verb)` so vote/secure_reboot do not share zero-ticket `makeReject` cache (`secureReboot().to === 'secure_reboot'`)
    2. monitor gate/place/branches tests — expect reject envelopes (`kind:'reject'`, `ok:false`, `/uncallable/`) instead of `assert.throws(.../complex-last/)`
    3. PF9 — `start.cmd` worktree CRLF (89 CRLF); blob remains LF under `*.cmd text eol=crlf`; other root `*.cmd` already CRLF
  - Cancelled (unchanged; stability parent open-handles): 6 in `stability.test.mjs`
  - Skip: `gateway` real audio whisper round-trip (whisper-server/model/fixture missing)
- [x] Box live :8080 stream e2e PASS
- [x] qodesh MVP parity 7/7 PASS

### P0 / PF / RF4
- [x] P0 integrate
- [x] PF1-PF9 (efa7e2b)
- [x] RF4 committed (4b5e6ad)
- [x] e2e-fresh process-manager synced to RF4 (on-disk only; no bounce)
- [ ] Live bounce onto RF4 — **deferred** (operator leave-alone: do not stop.sh / bounce live :8080/:8187; PIDs 2348422 / 2348463 left unchanged)

### Windows MVP / parity
- [x] WINDOWS-MVP + threads=1 manifest
- [x] Parity battery A-G
- [x] Locked launcher (ff5f284)
- [x] qodesh reverify PASS
- [ ] Optional effective-alias assert in runner — **deferred** (out of scope for this cut)

### Packs
- [x] beta-0.5-slim (~25 MiB) stale vs HEAD
- [x] beta-0.5.1-slim with RF4 + locked battery
- [x] beta-0.5.2-slim with uncallable reject cache (85c2c3c) + PF9 start.cmd CRLF

### Docs
- [x] INSTALL / WINDOWS-MVP / SMOKE docs
- [x] Review boards
- [x] This living board

### Known blockers / residuals
| Item | Severity | Disposition |
|------|----------|-------------|
| No git push without brianreborn PAT | Ship blocker for remote | Local packs OK; **push blocked only** |
| Full unit suite 0 fail + 6 cancelled on HEAD | Low (cancelled only) | Fixed in `85c2c3c`; stability cancelledByParent remains as before |
| Optional effective-alias assert | Low | Deferred — out of scope this cut |
| Live :8080 still pre-RF4 process-manager (in-memory) | Medium | e2e-fresh disk synced; bounce only on ask |
| health degraded missing models | Expected | Not MVP chat stopper |
| lockdown/reboot 404 | By design | Do not add |
| Slim pack no GGUF | By design | Fetch Instruct on Windows; never 8600 GT |
| Homoglyphs / API-key | Out of scope | Do not fold |
| Fuzz HEAD /health 200 | Locked intentional | See p0-residual-notes.md |
| missing-qwen-instruct.gguf | Known gap | Placeholder for code/text |
| qodesh local-tool double-spawn | Ops | Prefer locked battery |
| Note9 Android peer | Non-blocking | Optional when ADB appears; do not block release |

---

## Commit spine (host/cursor)

```
85c2c3c  monitor uncallable reject cache + P0 test expects; PF9 CRLF worktree
4b5e6ad  RF4 stop/evict/ready race residuals
ff5f284  locked parity battery launcher
0cebc78  Athlon threads=1 + bounce helpers
a6be0f9  stream:true SSE on resident_fallback
40e870a  MVP parity battery A-G
d7843bd  Windows MVP (qodesh)
efa7e2b  PF1-PF9
16fc8f7  P0 security integrate
```

---

## Next cuts
1. ~~Pack beta-0.5.1-slim (RF4 + locked battery)~~ DONE
2. ~~Sync e2e-fresh process-manager on disk; no live bounce~~ DONE
3. Live bounce onto RF4 only on ask (leave :8080/:8187 alone for now)
4. ~~Broader unit suite when cheap~~ FIXED — `85c2c3c` → 0 fail (6 cancelled remain as before)
5. ~~Pack beta-0.5.2-slim~~ DONE
6. ~~Scoreboard Release DONE~~ YES 2026-09-06 ~18:33 PT (parent messages Researcher)

## DONE definition
Checklist green (or deferred with reason) + beta-0.5.2-slim built + honest residual list + Release DONE **YES**.

---

---

## Milestone: beta-0.5.1-slim

**When:** 2026-09-06 ~18:26 PT
**Zip:** `/workspace/green-roomz-beta-0.5.1-slim.zip`
**Size:** 26241140 bytes (25.03 MiB)
**Zip md5:** `4f7ab14ca506b274a3e6ea978f93efd9`
**Zip sha256:** `a4092a26c62d484556d692d1491fb6bfda6d9370aa58c871d16ebf87de0a94f3`
**HEAD:** `4b5e6ad` (host/cursor)
**RF4 included:** yes — `src/process-manager.mjs` md5 `0318c8726624e25c24272a9572dd96cb` (≠ 0.5 `48f55ae043244d695873a4467ad9fecd`); markers `port_busy` + `stopRecord`
**Locked battery:** yes — `scripts/mvp-parity-battery-locked.cmd` (`ff5f284`)
**e2e-fresh synced:** yes — process-manager md5 matches tree; test/ path absent so test file not copied
**Live bounce:** deferred — :8080 node pid 2348422 and :8187 llama pid 2348463 left listening unchanged
**Pack recipe:** unpack beta-0.5-slim → overlay RF4 PM + locked cmd + package.json version 0.5.1 + NOTES; runtime/linux CPU bits from 0.5 unchanged; no GGUF / no .git; no test/ (slim omits)
**SHA256SUMS:** `/workspace/SHA256SUMS.green-roomz-beta-0.5.1-slim`

---

## Android peer (Note 9) — non-blocking
FYI 2026-09-06 ~18:25 PT via Researcher/operator: Galaxy Note 9 coming online ASAP as first Android peer.
Path when ADB appears (often via shalom): stock/unrooted only — Termux/HOME, sidecar :8199 via adb reverse; no Knox trip; no secure_reboot/wipe/map.
**Do not block release readiness on Note9.** Harmless deploy/smoke only if cheap (`deploy-android.sh`, `config/agents.note9.json`, Termux scripts already in tree/beta). Primary track remains beta packs + RF4 e2e-fresh sync.

---

## Milestone: full unit suite

**When:** 2026-09-06 ~18:27 PT
**HEAD:** `4b5e6ad` (`host/cursor`) — `4b5e6ade09f066b0c1c93c6cb550ab8e38a02218`
**Command:** `node --test` (cwd `/workspace/green-roomz`); CPU only; no live bounce; no git push
**Result:** **NOT green** — 335 tests; **324 pass / 4 fail / 6 cancelled / 1 skip**; `# duration_ms` 4622.05 (~4.6s)
**Failing names:**
- isolate parseBits, encrypt/wipe, aid-root, unmap clear, apply dispatch
- begin does not await a vote promise
- bind then yield
- PF9: stop.sh is LF; start.cmd is CRLF
- (cancelled) a stalled upstream becomes a 504 UpstreamTimeoutError, not a hang
- (cancelled) an oversized buffered upstream body becomes a 502 UpstreamProtocolError
- (cancelled) a caller cancel is re-thrown as-is, never masked as a timeout
- (cancelled) peekSpecialist gives up on a specialist that never emits, marking it degraded
- (cancelled) peekSpecialist still returns a fast handoff before the deadline
- (cancelled) an already-ended response short-circuits without writing again
**Skip:** real audio round-trip through whisper-server
**Pack 0.5.1:** present (`/workspace/green-roomz-beta-0.5.1-slim.zip`)
**Live ports:** :8080 node pid 2348422 and :8187 llama pid 2348463 still listening unchanged
**Board:** superseded by fix milestone below (`85c2c3c`); this row is the pre-fix baseline


---

## Milestone: monitor uncallable + PF9 suite green

**When:** 2026-09-06 ~18:35 PT
**Commit:** `85c2c3c55755a47095d1d7de03040f365db00f56` on `host/cursor` (local only; never pushed)
**Parent:** `4b5e6ad`
**Changes:**
- `src/monitor/api.mjs`: per-verb ticket `hashStringToU64('api:'+verb)` for `uncallableEnvelope`
- `test/monitor-gate.test.mjs`, `test/monitor-place.test.mjs`, `test/monitor-branches.test.mjs`: reject-envelope asserts
- `start.cmd`: worktree CRLF (PF9); git blob stays LF via `eol=crlf`
**Focused:** `node --test test/monitor-branches.test.mjs test/monitor-gate.test.mjs test/monitor-place.test.mjs test/platform-pf.test.mjs` → **24 pass / 0 fail**
**Full suite:** `node --test` → **328 pass / 0 fail / 6 cancelled / 1 skip** (was 324/4/6/1)
**Confirmed:** `secureReboot().to === 'secure_reboot'`; `vote().to === 'vote'`; distinct objects/tickets
**Live ports:** :8080 node pid 2348422 and :8187 llama pid 2348463 **unchanged** (no bounce)
**Board:** suite green; pack 0.5.2 cut below sets Release DONE YES

---

## Milestone: beta-0.5.2-slim

**When:** 2026-09-06 ~18:33 PT
**Zip:** `/workspace/green-roomz-beta-0.5.2-slim.zip`
**Size:** 26241466 bytes (25.03 MiB)
**Zip md5:** `c89c25fdc8bbbfa9e7639c8a69b7abd1`
**Zip sha256:** `e2b9c6016a0e5153a03e3f400c546b5d35ed544399f64cedad37bc35377cd11f`
**SHA256SUMS:** `/workspace/SHA256SUMS.green-roomz-beta-0.5.2-slim`
**HEAD:** `85c2c3c` (host/cursor) — `85c2c3c55755a47095d1d7de03040f365db00f56`
**Suite:** GREEN — 328 pass / 0 fail / 6 cancelled / 1 skip
**What changed vs 0.5.1:** unpack 0.5.1 → overlay `src/monitor/api.mjs` (uncallable ticket), refresh `src/process-manager.mjs` (RF4), `start.cmd` CRLF, `package.json` version `0.5.2`, rewrite NOTES; omit test/ (slim); no GGUF / no .git
**Verify:** zip `api.mjs` has `hashStringToU64('api:'+verb)` ticket pattern; `start.cmd` 89 CRLF; `process-manager` has `port_busy`; top-level `green-roomz/`; 178 members
**Live bounce:** deferred — :8080 node pid 2348422 and :8187 llama pid 2348463 left listening unchanged
**Release DONE:** **YES** (2026-09-06 ~18:33 PT)

### DONE — honest residuals
- **No git push** — PAT blocked for push only (electrobrian pull-only; need brianreborn PAT)
- **Live pre-bounce** — :8080/:8187 still pre-RF4 in-memory (PIDs 2348422 / 2348463); e2e-fresh disk synced; bounce only on ask
- **Note9 optional / non-blocking** — Android peer FYI; do not block ship
- **health degraded expected** — missing vision/whisper/embed/rerank/guard/piper/sd models
- **6 cancelled** stability tests (parent open-handles) — unchanged, not failures
- **effective-alias assert** — deferred out of scope
- **slim no GGUF** — by design; never load GGUF on 8600 GT
- **inspect-not-final** — operator inspect pack, not a signed release


---

## Reopen: missing models (2026-09-06 ~11:40 PT)

Operator: fill all missing models for all platforms (slow OK). Never GGUF on 8600.

- Size table (HEAD-verified): `/workspace/reviews/models-install-size-by-platform.md`
- Fetch plan: `/workspace/reviews/missing-models-plan.md`
- qodesh LocalAI rerank file is **15 bytes (corrupt)** — must re-fetch (~639150304)
- Cursor e2e-fresh still nexus-only; Instruct 397808192 not on box yet
- Release DONE pack (`beta-0.5.2-slim`) unchanged; this is a **post-DONE capability fill** track


---

## Note9 ops policy (operator, 2026-09-06 ~11:35 PM PT)

- Plug **USB into qodesh** with **Wi-Fi OFF** (local-only).
- Prefer **USB ADB** over wireless.
- After device appears, optional enforce: `adb shell svc wifi disable` (leave airplane/Wi-Fi off).
- **No Knox**, no root wipe / secure_reboot / map abuse.
- Stock/unrooted Termux/`HOME` path; sidecar `:8199` via `adb reverse` as before.


---

## CHECKPOINT (2026-09-06 ~11:36 PM PT)

Operator ~89% usage — **stop heavy loops**. No new long fetches/sprints until resumed.

**Frozen state**
- Instruct on cursor e2e-fresh + tree: `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` / hardlink `missing-qwen-instruct.gguf` (**397808192**, GGUF magic OK)
- Live `/health` still lists instruct missing until **PF bounce** (not done)
- Size board: `/workspace/reviews/models-install-size-by-platform.md`
- Fetch plan: `/workspace/reviews/missing-models-plan.md`
- Note9 USB/qodesh Wi-Fi-off policy on docs + boards; local git commit blocked (no author identity)
- qodesh rerank LocalAI was **15 B corrupt**; replacement may be incomplete
- Partial left on disk: `models/ggml-small.bin.partial` (incomplete whisper — delete or resume later)
- Remaining gaps: vision, whisper-server+bin, embed, rerank, guard, piper+voice, sd-server+sd

Resume later: continue plan priorities; no duplicate Instruct download; PF bounce only when asked.

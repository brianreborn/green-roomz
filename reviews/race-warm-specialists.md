# Race review — multi-specialist warm (models fill-in)

**Date:** 2026-09-06 PT (checkpoint)  
**Scope:** Warming embed / rerank / instruct (and other empty-profile specialists) under Athlon 2-core `threads=1` (`agents.windows-mvp.json`) vs box 8-core (`agents.cursor.json`). Focus: `cpu_oversubscribed`, port reuse, cold-start chains.  
**Live (do not stop):** `:8080` gateway + nexus `:8187` only. No specialist warm at review time.  
**Out of scope:** patch apply, git push, serve bounce. RF4 port_busy / exit-wait already landed (pass4).  
**Status:** CHECKPOINT — board written; Race Reviewer paused per Researcher.

**Configs:** both manifests `max_warm_specialists: 1`. MVP nexus/code/text = `cpu-1`/`cpu-1b` (`--threads 1`). Cursor nexus/code/text = `cpu-4`/`cpu-6`. Embed/rerank/vision/audio/safety/speech/image/monitor: `profiles: []`.

---

## Critical

### WARM-C1 — Empty `profiles: []` → `DEFAULT_THREADS=4` → permanent `cpu_oversubscribed` on Athlon 2c

| | |
|---|---|
| **Where** | `process-manager.mjs:42-48` `argsThreadCount`; `:131-133` `orderProfiles` → `[{id:'default', args:[]}]`; `:453-456` inject `--threads`/`--threads-batch` `DEFAULT_THREADS` (4); `:567-577` admission; `cpu-set.mjs` `DEFAULT_THREADS = 4` |
| **Race / who wins** | Deterministic deny. Athlon nexus holds 1 → remaining 1; empty-profile specialists want **4**. Cursor 8c nexus 4 → remaining 4 → one specialist fits; second needs `max_warm=1` evict. |
| **Impact** | MVP Athlon: embed/rerank/peers never start while nexus resident. Box: one warm OK; multi-path pays cold-start+evict. |
| **Harden** | Manifest `cpu-1`/`cpu-1b` on MVP (and explicit threads on Cursor). Or refuse DEFAULT inject when `profiles:[]`. Do not drop nexus threads. |

---

## High

### WARM-H1 — Spontaneous exit leaks `CpuSetAllocator`; `stopRecord` skips release

| | |
|---|---|
| **Where** | `process-manager.mjs:637-643` exit handler — no `release`; `:705-708` `stopRecord` early-return when `exitCode !== null` before release; `:85-91` `liveThreadSum` excludes exited |
| **Who wins** | Crash/OOM → live budget frees, allocator still holds → other aliases get false `cpu_oversubscribed` until same-alias restart or serve restart. |
| **Harden** | Idempotent `release` in exit handler and/or always in `stopRecord` even when already exited. |

### WARM-H2 — Dual CPU budget (`liveThreadSum` vs `CpuSetAllocator`)

| | |
|---|---|
| **Where** | `:567-577` vs `:597-601`; chain `:426-428` weakens same-chain TOCTOU |
| **Impact** | Amplifies WARM-H1 desync under fill-in crash + re-warm. |
| **Harden** | One source of truth after release-on-exit. |

### WARM-H3 — Council `parallel: true` + pin holds bypass `max_warm=1`

| | |
|---|---|
| **Where** | `gateway.mjs:707-709` `canParallel = spec.parallel ?? admit-all-ready` — explicit `parallel` forces `Promise.all(runOne)`; `:685-698` each `runOne` `ensure` then `pin`; `process-manager.mjs:764-766` `evictForNewSpecialist` skips `refs > 0` / pinned |
| **Race / who wins** | `coldStartChain` serializes spawn only. Concurrent pinned peers are not eviction victims → multiple specialists stay live under `max_warm=1`. |
| **Impact** | Athlon/Cursor both `max_warm=1`: mid-council thread oversubscribe or cascading `cpu_oversubscribed`. Serial path (no `parallel`, not all ready) unpin-before-next is OK. |
| **Harden** | Ignore/refuse `parallel` when `activeWarm + aliases.length > maxWarmSpecialists`, or require exclusive lease before pin; never let refs alone defeat ceiling without a parallel-admit gate. |

---

## Medium

### WARM-M1 — `max_warm=1` + multi-`ensure` → serialize + evict thrash

| | |
|---|---|
| **Where** | `gateway.mjs` ensure sites; `process-manager.mjs:416-428` evict + chain |
| **Impact** | Flip-flop latency under council+chat once fill-in models land. RF4 covers port wait. |
| **Harden** | Keep ceiling; document cost; do not raise without CPU math. |

### WARM-M2 — Similarity judge warms embed without `pin`

| | |
|---|---|
| **Where** | `gateway.mjs:772-790` `ensure(semantic-embedding-agent)` then embed loop — **no** `pin`; catch swallows |
| **Race / who wins** | Concurrent ensure(text/code) or `sweepIdle` can `stop` embed (`refs===0`) mid-loop → empty vectors → degenerate `similarityVote` + another cold-start thrash. |
| **Harden** | `pin` for the embedding loop (same as `runOne`); fail closed if lease lost. |

### WARM-M3 — Suspend path (if enabled) holds threads outside warm ceiling

| | |
|---|---|
| **Where** | `:176` `canSuspend`; liveThreadSum counts suspended; ceiling excludes them |
| **Note** | Default MVP/Cursor: `suspend_evicted` unset → `canSuspend=false` (N/A today). Latent if enabled. |

---

## Low

### WARM-L1 — Port reuse after evict — RF4 landed (no new bug)

### WARM-L2 — Resident nexus bypasses chain — by design; reserve nexus threads first

### WARM-L3 — Failed `startProfile` leaves exited row in `processes`

| | |
|---|---|
| **Where** | `process-manager.mjs:651-655` `stopRecord` + release, **no** `processes.delete`; contrast `stop` `:698-699` |
| **Impact** | Stale map until next ensure overwrites; compounds H1 if exit already set. |
| **Harden** | `processes.delete(alias)` after failed start once child dead. |

---

## Platform matrix (fill-in)

| Host | Nexus threads | Remaining | Empty-profile want 4 | Outcome |
|------|---------------|-----------|----------------------|---------|
| Athlon 2c MVP | 1 | 1 | 4 | permanent `cpu_oversubscribed` (C1) |
| Box 8c Cursor | 4 | 4 | 4 | one OK; second → evict (M1); parallel council → H3 |
| Box 8c sprint | 6 | 2 | 4 | oversubscribed unless specialist ≤2 |

---

## Suggested apply order (do not apply here)

1. Manifest threads for empty profiles on MVP (`cpu-1`) — unblocks Athlon.  
2. Release-on-exit (H1) + delete on failed start (L3).  
3. Unify CPU budget (H2).  
4. Gate council `parallel` vs `max_warm` (H3); pin embed judge (M2).  
5. Leave RF4 / `max_warm=1` / nexus lock as-is.

## Live note

Serve left running. Board only — no tree patch, no push. **Paused at checkpoint.**

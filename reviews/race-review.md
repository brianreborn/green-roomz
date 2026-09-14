# Green-Roomz race / liveness review

Tree: `/workspace/green-roomz` (live unzip at `/workspace/e2e-fresh/green-roomz` not re-diffed).
Scope: stability, races, liveness only. No exploit / PoC. Trust-boundary review is out of scope.

Policy held: `lockdown` / `reboot` / `secure_reboot` stay uncallable stubs. 8080 mask is `CAP.POST|OBSERVE|SNAPSHOT` only (`src/gateway.mjs:32-33`). No race found that makes reboot-class callable from 8080.

Intended 4-thread resident default is **not** a machine cap on Cursor/Note9 (see RACE-L3).

---

## Critical

### RACE-S1 — PolicyGate can pin `responsive` forever
- **finding:** `PolicyGate.acquire` has no settle-once, no `signal.aborted` check on the fast path, and `drain` drops aborted queue items without `reject`. `sleep()` already rejects on aborted; acquire does not.
- **file:line:** `src/scheduler.mjs:17-44`; callers `src/gateway.mjs:923`, `961`; `src/util.mjs:55-57`; Cursor `config/agents.cursor.json:8` (`responsive`, max 1); `src/gateway.mjs:1176` (`requestTimeout` default 0)
- **race:** abort listener (`filter` + `reject`) vs `drain().shift()`. Fast path (`active < maximum`) increments even when the client is already gone. `drain` `continue` on aborted skips both `reject` and `active++`. If `reject` wins after `active++`, the waiter never gets `release()`.
- **impact:** On Cursor `responsive` (`maxHeavyInFlight: 1`) the next chat `acquire()` never completes. HTTP `requestTimeout` 0 will not unstick it. Process restart is the only recovery.
- **fix:** `if (signal?.aborted) throw` at entry (mirror `sleep`). Increment `active` only when handing out `release`. `drain` must `reject` aborted items, not `continue`. `let settled` so abort/resolve cannot double-settle. Always `release()` in `finally` tied to that token. Default a finite `request_timeout_ms`.

---

## High

### RACE-P1 — `/health` is not this PID
- **finding:** `waitForReady` treats any HTTP 200 on the agent port as the new child. It does not re-check `exitCode` or bind ownership after the probe.
- **file:line:** `src/process-manager.mjs:471-495` (probe `479-490`); spawn `424-445`; nexus port `config/agents.cursor.json:292` (`8187`)
- **race:** new spawn vs leftover listener (failed bind, slow SIGKILL, prior serve orphan). Probe can complete while `record.child` has already died; top-of-loop `exitCode` check is not repeated after `fetch`.
- **impact:** Manager marks the new PID `ready`. Traffic hits the old process or a dead new PID. Applies to every specialist port and resident `:8187`.
- **fix:** After a successful probe require `child.exitCode === null`. Fail if the listener is not this child. Do not accept health from a port this PID did not bind.

### RACE-P2 — next profile spawns before the port is free
- **finding:** Failed `startProfile` SIGKILLs after 3s and returns without waiting for `exit` or the listen socket to drain. `start()` immediately tries the next profile on the same port. Failed record is left in `processes` until the next `set`.
- **file:line:** `src/process-manager.mjs:402-418`, `445`, `464-467`, `510-526`
- **race:** dying child vs next-profile spawn (same alias, same port). Kernel/reaper vs next `spawn`. Later `ensure()` can also start while `state === 'stopping'`.
- **impact:** Double-spawn, bind failure, or RACE-P1 stale health on retry.
- **fix:** After any stop, wait for `exit` (not just the kill timer) and `waitForPortsFree` **must fail closed** before the next spawn. `processes.delete` on failed start. Refuse `startProfile` while a record for that alias is `stopping`.

### RACE-P4 — no in-flight pin (evict / SIGSTOP / idle sweep)
- **finding:** Manifest `pinned` is the only skip. `ensure`+proxy/peek, slash, and `lock_alias` are not pins. `touch()` exists and is never called from the gateway. `lastUsedAt` is stamped at `ensure` entry. Cursor `idle_evict_ms` 120s < `UPSTREAM_TIMEOUT_MS` 180s. `max_warm_specialists: 1`.
- **file:line:** `src/process-manager.mjs:244-252`, `258-268`, `548-559`, `575-604`, `621-649`; callers `src/gateway.mjs:925-936`, `1048-1079`; `src/constants.mjs:39`; `config/agents.cursor.json:20-21`
- **race:** request A (`ensure` returned ready, then proxy/peek) vs request B `evictForNewSpecialist`, vs `setInterval` sweeper. B/sweeper wins: A is SIGTERM'd or SIGSTOP'd mid-graph. `resume()` sets `state='ready'` with no `/health` after SIGCONT.
- **impact:** Pinned-slot hang or connection reset. Client sits until 120s/180s timeout, 0 further tokens. `ensure()` keeps reusing a wedged “ready” PID (`263-268`).
- **fix:** Refcount in-flight hops per alias (`touch` on start, unref in `finally`). Never evict/SIGSTOP/checkpoint while refs > 0. Probe `/health` after SIGCONT; restart if not ready. Clamp `idle_evict_ms` above `upstream_timeout_ms`. Run resume on the same chain/`starting` map as cold start.

### RACE-L3 — 8 GGML threads on 4 CPUs (known 120s / 0-token stall)
- **finding:** Intended policy is a 4-thread *resident* budget. Cursor launches resident `:8187` **and** a specialist both at `--threads 4` (fallback `cpu-6`). No affinity. Empty `profiles` become `{args:[]}` so llama uses `hardware_concurrency`. Only `vulkan-all` is rewritten to `logical-2`.
- **file:line:** `config/agents.cursor.json:30-31` (`--parallel 1`), `134-172`, `313-350`; `src/process-manager.mjs:20-37`, `91-93`, `307-311`; `src/hosts/windows.mjs:40-46` (nice only); `src/memory.mjs:54-67` (`profileAdmitted` always `ok: true`); `src/nexus.mjs` consult 25s overlaps specialist gen
- **race:** nexus consult vs specialist generation. No `taskset`. GGML pools oversubscribe. Health/upstream timers fire late or produce 0 tokens until `cold_start_timeout_ms` / `UPSTREAM_TIMEOUT_MS`.
- **impact:** Matches 8 threads on 4 CPUs, 120s timeout, 0 tokens. Resident 4-thread default is not a machine cap. `cpu-6` fallback makes a failed start worse (see RACE-P10). Windows nexus `cpu-2` + `vulkan-all` rewrite is the intended split.
- **fix:** Cap Σ `--threads` of live llama processes to logical CPUs (resident 4 on a 4-core box ⇒ specialists 0 extra CPU threads, or drop resident to 2 as on Windows). Refuse `cpu-6` when `os.cpus().length < 6`. Inject `--threads` on the default profile. Do not raise `--parallel` above 1 on tight boxes.

### RACE-G1 — dual-post is not a transaction
- **finding:** `observeHop` posts mailbox + MonitorIpc + logger independently. Errors and IPC rejects are swallowed. Return values ignored.
- **file:line:** `src/gateway.mjs:448-468`; `src/monitor/ipc.mjs:351-360`, `425-432`; `src/mailbox.mjs:108-132`; `src/monitor/logger.mjs:114-165`
- **race:** mailbox `push` can succeed while `ipc.observeHop` returns `{ok:false}` (missing cap / unknown kind / stub) or logger `emit` drops. Not a torn slot inside one ring (JS is one thread). Auto-drain (`ipc.mjs:549-555`, `mailbox.mjs:152-158`) then broadcasts divergent views.
- **impact:** Split brain on `/v1/monitor/recent`. IPC `wait()` (`ipc.mjs:411-416`) is a snapshot: a ticket that landed only in the mailbox sees `events: []`. Partial publish is stable; neither side rolls back. Seq spaces differ (`number` vs `{hi,lo}`).
- **fix:** One publish: if IPC `ok !== true`, do not leave mailbox-only success; surface `{ok:false, reject}` on the hop path. IPC as source of truth, copy into mailbox. Do not `catch {}` capability rejects.

### RACE-G2 — hop acked `success` before the body finishes
- **finding:** Resident and peek paths publish `success` then `proxyJson` / `deliverPeek`. A later 504/abort still leaves a success envelope. `proxyJson` 503-retries onto `--parallel 1`.
- **file:line:** `src/gateway.mjs:503-520`, `1096-1101`, `1125-1129`; `src/proxy.mjs:70-126`; `config/agents.cursor.json:13`, `30-31`
- **race:** observer vs completion. Mailbox/IPC win (success already drained). Client/upstream lose. Retry fires a second POST while slot 0 still owns the first (`idempotency-key` + `retry_deadline_ms` 180s).
- **impact:** Monitors see success; client gets timeout / 0 tokens. Duplicate work on the only llama slot; later hops 503 until the retry deadline. Same symptom family as 120s / 0 tokens.
- **fix:** Publish `success` only after `proxyJson`/`deliverPeek` completes; on failure publish `agent_unavailable`/`timeout`. Do not 503-retry while the same alias/slot is occupied.

### RACE-G3 — peek abort does not wait for slot 0
- **finding:** Peek timeout aborts the stream then routing continues. Same alias is `hops.push`ed twice. The llama slot is not waited on.
- **file:line:** `src/handoff.mjs:167-173`, `220-227`, `254-274`; `src/gateway.mjs:1045-1086`
- **race:** `hopAbort.abort()` + `reader.cancel()` vs llama.cpp `--parallel 1` actually freeing slot 0. Gateway wins (moves on). Slot owner still holds the pin.
- **impact:** Next POST to that port 503s; `proxyJson` retries up to `retry_deadline_ms`. Peek window 20s + 120/180s retry looks like a hung generation / 0 tokens.
- **fix:** After peek abort, wait until `/health` reports slots idle (or a short slot-busy backoff) before the next hop to that port. Do not `hops.push` twice. Skip 503-retry on a just-aborted slot.

### RACE-L2 — `/slots/0` save/restore races the live completion
- **finding:** Checkpoint and prime always hit `/slots/0`. Every llama_server is `--parallel 1`. `stop()` saves then SIGTERM while a stream may still own the slot.
- **file:line:** `src/process-manager.mjs:150-165`, `223-236`, `346-350`, `497-502`; `bin/green-roomz.mjs:271-282` (`cache_prompt: true`, `AbortSignal.timeout(120_000)`)
- **race:** `stop()` checkpoint vs in-flight reader. Prime restore after ready vs first chat. `--cache-idle-slots` can spill the only slot mid-abort.
- **impact:** KV restore into a busy slot / idle-spill of an aborting slot → llama stall, 120s prime/cold-start timeout, 0 tokens.
- **fix:** Serialize slot actions with the hop refcount (RACE-P4). Do not save/restore/spill slot 0 while a request is active. Prime must check `res.ok` and completion_tokens > 0 before snapshot.

### LIVE-LOG1 — logger fail-open (missing sink is a no-op success)
- **finding:** Write errors and flood drops return `{ok: true, dropped: true}`. No path ⇒ writer `() => undefined`. Gateway default-constructs that logger. `emit` callers think they logged. Role missing still throws (`assertCaller`) — that part is fail-closed — but gateway swallows it.
- **file:line:** `src/monitor/logger.mjs:5-6`, `82-84`, `122-123`, `157-162`; `src/gateway.mjs:297`, `448-467`
- **race:** none needed. Flood (`inFlight >= 4`) silently drops. Unbounded `chain.push` (`153`) with no cap.
- **impact:** Lost audit. Waiters that treat `ok: true` as durable proceed. Heap growth under hop flood → event-loop pressure.
- **fix:** Missing path / missing emit cap / write failure must `{ok:false, dropped:true}` (or throw), never `ok: true`. Cap `chain`. If audit is required, refuse to serve without a sink. Gateway must not `catch {}` emit rejects.

### RACE-M1 — mailbox drain re-enters on listener `push`
- **finding:** `Mailbox.drain` notifies listeners inside `while (this.size > 0)`. A listener `push()` extends the same drain. IPC snapshots first; mailbox does not.
- **file:line:** `src/mailbox.mjs:135-148` vs `src/monitor/ipc.mjs:435-444`
- **race:** drain vs reentrant producer, same tick. Producer wins: `size` never hits 0.
- **impact:** Event-loop livelock; `setImmediate` drain blocks HTTP. Default gateway has no mailbox `onEvent` that pushes (latent unless a monitor is attached).
- **fix:** Snapshot/steal the batch (like `CopyRing.drainCopies`) before callbacks; cap listener-push recursion.

---

## Medium

### RACE-P3 — hung `/health` counts as “port free”
- **finding:** `waitForPortsFree` treats fetch timeout as free, then after 8s returns success anyway (no throw).
- **file:line:** `src/process-manager.mjs:601-602`, `607-619`
- **race:** evictor vs child still bound but not answering within 400ms. `catch` path wins.
- **impact:** Spawn proceeds onto an occupied port → bind fail or P1 stale health.
- **fix:** Probe timeout = still occupied. On deadline fail `evictForNewSpecialist`. Prefer connect-to-closed / bind check over HTTP.

### RACE-P6 — resume skips `coldStartChain` and `starting`
- **finding:** `ensure` SIGCONTs a suspended model immediately, off the specialist lock. Resume can race eviction of the same alias.
- **file:line:** `src/process-manager.mjs:244-252`, `263-298`
- **race:** `ensure(A)` resume vs `ensure(B)` `evictForNewSpecialist` (or sweep). Evict/stop can win after resume already returned `ready`.
- **impact:** Proxy to a just-killed or re-stopped PID.
- **fix:** Resume through the same chain as cold start; set `starting` for the duration; evict skips resuming/refcounted aliases.

### RACE-P8 — council bypasses PolicyGate and the warm cap
- **finding:** `handleCouncil` does not `policy.acquire`. `spec.parallel ?? …` lets `parallel: true` skip the “all already ready” guard. Parallel `ensure()` + `max_warm_specialists: 1` evicts siblings under the callers.
- **file:line:** `src/gateway.mjs:617-647`; `src/process-manager.mjs:279-296`, `552-604`; `config/agents.cursor.json:20`
- **race:** `Promise.all(runOne)` vs serialized `coldStartChain` vs `evictForNewSpecialist`. Last `ensure` wins the warm slot; earlier aliases die mid-fetch.
- **impact:** Dropped council legs, 503/ECONNREFUSED, N×180s fetches, starves interactive chat on `responsive`.
- **fix:** Always `policy.acquire` around council. Honor `parallel` only when every alias is ready **and** fits under `maxWarmSpecialists`. Never evict an alias in the current council set. If parallel is forced on a tight box, reject.

### RACE-P10 — timeout on `cpu-4` retries as `cpu-6`
- **finding:** `start()` falls through from a timed-out `cpu-4` spawn into `cpu-6` on the same port.
- **file:line:** `src/process-manager.mjs:402-418`; `config/agents.cursor.json:134-172`, `313-347`
- **race:** health-deadline failure vs next-profile spawn (compounds P2 + L3). The more-threaded profile wins the retry.
- **impact:** Worse oversubscribe after a 120s/180s timeout instead of a clean 503.
- **fix:** Do not retry a higher `--threads` after timeout/OOM. Skip profiles whose `--threads` exceed remaining CPUs.

### LIVE-G1 — unbounded request lifetime + sync council I/O
- **finding:** HTTP `requestTimeout` defaults to 0. `maximize` admits unbounded heavy in-flight. Field-vote `readFileSync`s the whole council jsonl; `appendFileSync` on the hop path.
- **file:line:** `src/gateway.mjs:1175-1176`, `683-701`, `754`; `src/constants.mjs:15-18`; drain `src/mailbox.mjs:152-158`, `src/monitor/ipc.mjs:549-555`
- **race:** hop flood vs single thread. Drain listeners and sync I/O starve `/health` and abort.
- **impact:** Event-loop stall; llama slots stay busy because abort never runs.
- **fix:** Default a finite `request_timeout_ms`. Bound `maximize` on small hosts. Make council I/O async.

### LIVE-ENT1 — entropy missing cap is a no-op, unknown source aliases in
- **finding:** No capability check. Unknown sources become `voluntary_feed`. Unseeded `hash`/`enroll` return `{ready:false}` without reject. `neverInvokeRespond` is empty.
- **file:line:** `src/monitor/entropy.mjs:67-70`, `78-81`, `191-233`
- **race:** n/a (sync). A waiter that loops `enroll()` until `ready` spins.
- **impact:** Callers credit/hash with no rights. Bad mix-in still mutates the pool.
- **fix:** Missing CREDIT cap → reject envelope. Unknown source → reject, do not alias. Treat `{ready:false}` as terminal for v1 enroll unless a backoff waiter exists.

### LIVE-NTP1 — no NTP; vote TTL can be forever
- **finding:** No time-sync module. Role `ntp` exists only to deny `reset`. Envelopes use `Date.now()`. `DEFAULT_VOTE_TTL_MS = undefined` ⇒ `isExpired` never true.
- **file:line:** `src/monitor/calls.mjs:28`, `79-80`; `src/monitor/respond.mjs:42-43`, `214-218`; `src/monitor/api.mjs:71`
- **race:** wall-clock jump vs TTL. Missing NTP is fail-open (local clock).
- **impact:** Stalled-quorum / stale-vote. Clock step can strand expiry.
- **fix:** If NTP is a required cap, missing must reject time-stamped verbs. Else pin expiry to `process.hrtime.bigint()` and never default TTL to forever.

### RACE-M2 — full mailbox overwrites unconsumed slots, still `{ok:true}`
- **finding:** Drop-oldest when full. Dropped events never reach drain listeners. Same-turn burst before `setImmediate` can drop even with `autoDrain`.
- **file:line:** `src/mailbox.mjs:119-132`
- **race:** producer vs slow/absent drain. Producer wins.
- **impact:** Lost hops. Monitor-critical kinds are not special-cased.
- **fix:** Count in-turn overflow. Reject-on-full for monitor-critical kinds; keep drop-oldest only as documented best-effort.

### RACE-M3 — mailbox seq is a JS number; IPC is `{hi,lo}`
- **finding:** `push()` returns `this.seq + 1` even when the stored envelope seq is `{hi,lo}`. Precision dies at 2^53. Dual-post seqs are not comparable (G1).
- **file:line:** `src/mailbox.mjs:55-58`, `109-111`, `127`, `132`; `src/monitor/ids.mjs:65-69`
- **race:** none concurrent; identity mismatch.
- **impact:** Stale/duplicate seq for waiters correlating rings.
- **fix:** One seq type (`{hi,lo}` + `u64Inc`). Return the stored envelope seq.

### RACE-I1 — rejects share the hop ring
- **finding:** `CopyRing.pushCopy` drop-oldest on full. `_reject` enqueues on the hot ring with hops (`kind !== 'upcall'`).
- **file:line:** `src/monitor/ipc.mjs:197-207`, `483-502`, `511-512`
- **race:** hop flood vs reject flood vs drain. Newer publish wins; oldest unconsumed slot is overwritten.
- **impact:** Drop of hops or rejects. Caller `ok` is about caps, not occupancy.
- **fix:** Third queue or reserved slots for rejects; or reject-on-full so rejects cannot erase hops.

### RACE-I2 — caller-supplied seq kept; `wait()` dedupes on `seq:kind`
- **finding:** `_enqueue` always `u64Inc`s `this.seq` but keeps a caller non-zero seq. Duplicate `(seq, kind)` → later copy discarded in `wait`.
- **file:line:** `src/monitor/ipc.mjs:505-510`, `534-539`
- **race:** caller-chosen seq vs auto seq.
- **impact:** Lost wait copy / apparent single event. Drain still broadcasts both.
- **fix:** Always stamp `copy.seq` from `this.seq`. Dedupe on ring occupancy id, not caller seq.

### RACE-I3 — first reject for a ticket is process-global forever
- **finding:** First `makeReject` is cached; later `_reject` returns the cache and does not re-enqueue. Combined with drop-oldest + `recentLimit`.
- **file:line:** `src/monitor/ipc.mjs:483-490`; `src/monitor/states.mjs:57`, `151-178`
- **race:** first reject vs later reject vs ring drop vs `recentBuf` eviction. First reject wins forever.
- **impact:** Stale reject reason. `wait()` can lose the envelope after overflow while `push` still returns the cached reject.
- **fix:** Per-`MonitorIpc` cache (or none); re-enqueue if the live ring/`byTicket` no longer holds it; TTL the map.

### RACE-I4 — live rings are not 32-bit lock-free
- **finding:** Spec (`ids.mjs:3`) says lock-free 32-bit atomics. Live `CopyRing`/`Mailbox` use JS `Array` occupancy. Tests assert `hot.slots` is not a SAB (`test/monitor-ipc.test.mjs:26`). `ringIndex32` is never the slot index. Fuzz “concurrent” tests only `await Promise.resolve()` on one loop.
- **file:line:** `src/monitor/ipc.mjs:185-230`; `src/mailbox.mjs:63-68`, `119-126`; spec `src/monitor/ids.mjs:3-4`, `86-95`
- **race:** n/a on the Node heap. Against `worker_threads` / a mapped CUDA ring using this algorithm: data race on `size`/`head`/`tail`.
- **impact:** Today: spec/test gap. If ported: torn occupancy, double-consume, overwrite, ABA on `seq.lo`.
- **fix:** Keep copy-only JS rings explicitly SPSC/event-loop. If a 32-bit lock-free ring is required, that is a new implementation (Atomics, seq-before-data), not this occupancy.

### RACE-D2 — `wait()` after auto-drain is history, not occupancy
- **finding:** `wait()` is a non-blocking copy (no sleeper, so no lost-wakeup futex). After `autoDrain`, the ring is empty; history is `recentLimit` 64 vs hot 256.
- **file:line:** `src/monitor/ipc.mjs:411-416`, `530-546`, `549-555`; `src/mailbox.mjs:152-158`
- **race:** `setImmediate` drain vs `wait()` vs drop-oldest. Drain wins occupancy.
- **impact:** Missed ticket events (looks like hang if a caller polls `wait` until seen). Not double-consume (`wait` does not steal).
- **fix:** If `wait` is a completion API, keep per-ticket durable copies until `reply`/TTL. Do not auto-drain slots `wait` still needs.

---

## Low

### RACE-M4 — mailbox drain iterates live `listeners`
- **file:line:** `src/mailbox.mjs:137` vs `src/monitor/ipc.mjs:436`
- **race:** `onEvent` / unsubscribe vs in-flight `for`.
- **impact:** Skipped or extra listener delivery (not double-consume).
- **fix:** `this.listeners.slice()` before the loop.

### RACE-I5 — `drainCopies` peeks `size` then clears `size` again
- **file:line:** `src/monitor/ipc.mjs:210-229`
- **race:** TOCTOU producer vs drainer **if concurrent**. JS: SAFE.
- **impact:** Ported: new slots cleared and not in `out`.
- **fix:** Snapshot `n = this.size` (or CAS-steal head/tail) and only clear that range.

### RACE-I6 — `CopyRing` mask is not forced pow2
- **file:line:** `src/monitor/ipc.mjs:186-188` vs `src/mailbox.mjs:26-28`, `63-64`
- **impact:** If `HOT_RING_SLOTS`/`UPCALL_SLOTS` cease to be powers of two: aliased slots, stuck `size`. Today 256/16.
- **fix:** `nextPow2(slots)` like `Mailbox`.

### LIVE-I1 — `byTicket` / `rejectsByTicket` keys grow without bound
- **file:line:** `src/monitor/ipc.mjs:518-525`; `src/monitor/states.mjs:57`, `172`
- **impact:** Memory growth, sticky cross-instance rejects.
- **fix:** Cap map size, expire tickets, instance-local reject maps.

### LIVE-M1 — `_drainScheduled` cleared before `drain()`
- **file:line:** `src/mailbox.mjs:152-158`; `src/monitor/ipc.mjs:549-555`
- **impact:** If `drain` throws, remaining slots sit until the next `push`.
- **fix:** `try/finally`; reschedule if `size > 0`.

---

## SAFE (looks racy, isn’t)

- **coldStartChain deadlock:** specialist starts are linear FIFO (`prev.catch(() => {}).then(bringUp)`); same alias joins `starting`; resident bypasses the chain. No A-waits-B-waits-A. Head-of-line blocking is convoy latency, not deadlock. (`process-manager.mjs:263-298`; `test/process-manager.test.mjs:27-51`, `394-424`)
- **same-alias ensure coalesce:** `starting` is set synchronously before any `await`. No double-spawn of the same alias on one Node thread. (`278`, `297-298`)
- **reboot / lockdown / 8080:** stubs throw or reject (`ipc.mjs:313-331`, `361-369`; `respond.mjs:326-340`, `504-521`; `isolate.mjs:276-279`, `433-446`; `network.mjs:238-240`). 8080 never imports reboot verbs. `isolate.grant` of lockdown bits to `green-roomz` is denied. Leave stubs uncallable; do not enable.
- **SPSC on this heap:** `CopyRing`/`Mailbox` store JS objects. `u64Inc` returns a new `{hi,lo}`. No SAB, no torn hi/lo, no Atomics ordering needed here. Capacity-check-then-publish is not TOCTOU on one thread. `_scheduleDrain` coalescing does not lose wakeups. IPC broadcast drain clones; it does not steal. Mailbox circular overwrite math is correct SPSC when `head === tail`.
- **`wait()` does not block:** empty ticket → `{ok:true, events:[]}`. Forever-wait only if the *caller* loops (G1/D2).
- **IPC/isolate/network/respond missing-bit paths** reject envelopes, not silent success (logger `assertCaller('emit')` throws unless gateway swallows it).
- **resident nexus** is never stopped for specialists (`275-277`). Parallel council is the hole (P8); default serial `ensure` is safe.
- **`vulkanAllThreadCount(4) === 2`** is the right APU split. The 8-on-4 failure is Cursor `cpu-4`+`cpu-4`, not this rewrite.
- **Peek deadline** (`handoff.mjs:172-173`, `220-227`; `test/stability.test.mjs:115-129`) bounds a silent stream. Leftover bug is slot reuse after abort (G3), not an unbounded peek.
- **Unseeded entropy** does not `secure_reboot` and does not block after first seed. Issue is missing-cap no-op (ENT1).
- **Shipped port uniqueness:** `tool-router-agent` exclusive `:8187`; `validateManifest` rejects duplicate ports before variants. Optional: validate again after `expandVariants`.

---

## Priority order to fix

1. RACE-S1 — `responsive` deadlock
2. RACE-P4 — in-flight refcount (unlocks P5/P6/L1/L2/G3)
3. RACE-L3 + P10 — machine thread cap; never escalate to `cpu-6`
4. RACE-P1 + P2 + P3 — health/PID/port
5. RACE-G2 + G3 — success-after-complete; slot idle after peek abort
6. RACE-G1 + LIVE-LOG1 + ENT1 — reject, do not no-op
7. RACE-M1 + I1/I2/I3 — ring occupancy vs wait identity

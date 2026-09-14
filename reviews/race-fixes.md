# Green-Roomz race fix pack

> **Pass 3:** apply order and P0/P1 split live in `/workspace/reviews/integrate-refinement.md`. This file is the race sketch; **do not fork** that stitch. RF4 and PLAT-S1/I1 are **not** this `src/` cut. Tree frozen until Researcher applies P0.


Date: 2026-09-03. Finder: `/workspace/reviews/race-review.md`. Pass-2: `/workspace/reviews/race-pass2.md`.
Tree: `/workspace/green-roomz`. **Do not patch yet** — Researcher integrates with the other four packs.

Stability/liveness only. No exploit PoCs. `lockdown` / `reboot` / `secure_reboot` stay uncallable. 8080 stays POST|OBSERVE|SNAPSHOT. Operator lock: **4-thread resident default**, **6-thread sprint**. Refuse oversubscribe (Σ live `--threads` ≤ `nproc`). Do not drop Cursor nexus to 2.

Compose with covert-fixes: F3 (no live `cache_prompt` / idle-slot spill), F5 (`CpuSetAllocator`), F8 (inference allowlist), F13 (prime restore **only when slot idle**), F19 (reject TTL), F22 (logger cap). Constraints on F1/F5/F13 are in pass-2 “Integration hazards”.

---

## Apply order

**Superseded by** `/workspace/reviews/integrate-refinement.md` Apply order (this cut). P0: RF1, RF2, RF3, HTTP shape, RF5, RF6/RF7, F4/F14/RF9, hashed tickets + reject envelopes. **RF4 and RF8 are P1.** PLAT-S1/I1 next cut, not this `src/` cut.

Sketch below still valid for tests/invariants; do not reorder around the stitch.

Tests go with each RF. No git push.

---

## RF1 — PolicyGate cannot pin `responsive`

**Invariant:** every `acquire` either throws/rejects on abort or returns a `release` that will run. `active` never stays elevated without a live holder. `drain` never drops a waiter without settling its promise.

`src/scheduler.mjs`:

```js
async acquire(signal) {
  if (signal?.aborted) throw signal.reason ?? new Error('aborted');
  if (this.active < this.maximum) {
    this.active += 1;
    return () => this.release();
  }
  return new Promise((resolve, reject) => {
    const item = { resolve, reject, signal, settled: false };
    const settle = (fn) => {
      if (item.settled) return;
      item.settled = true;
      fn();
    };
    this.queue.push(item);
    signal?.addEventListener('abort', () => {
      this.queue = this.queue.filter((entry) => entry !== item);
      settle(() => reject(signal.reason ?? new Error('aborted')));
    }, { once: true });
  });
}

drain() {
  while (this.queue?.length && this.active < this.maximum) {
    const item = this.queue.shift();
    if (item.settled) continue;
    if (item.signal?.aborted) {
      item.settled = true;
      item.reject(item.signal.reason ?? new Error('aborted'));
      continue;
    }
    this.active += 1;
    item.settled = true;
    item.resolve(() => this.release());
  }
}
```

Gateway: keep `release()` in `finally` (already at `handleDirectAlias` / `handleChatTurn`). **Council must `acquire` too** (RACE-P8).

Covert F1: any `holdMs` sleep runs **after** `release()`, not inside the acquired region.

**Tests** (`test/scheduler.test.mjs`):

- abort before `acquire` with `active === maximum` → rejects; `active` unchanged; next acquire proceeds
- abort after dequeue: only one of resolve/reject; if reject, `active` not incremented
- `responsive` (max 1): two overlapping acquires; abort the waiter; third acquire gets the slot after release
- already-aborted signal on fast path throws and does not increment

---

## RF2 — in-flight refcount per alias

**Invariant:** `evictForNewSpecialist`, `sweepIdle`, `suspendRecord`, `checkpointModel`, `restoreModel`, covert F13 prime-restore, and `stop()` refuse an alias with `refs > 0` unless the caller is that hop’s own teardown.

`src/process-manager.mjs`:

```js
pin(alias) {
  const rec = this.processes.get(alias);
  if (!rec) return () => {};
  rec.refs = (rec.refs ?? 0) + 1;
  rec.lastUsedAt = Date.now();
  return () => {
    rec.refs = Math.max(0, (rec.refs ?? 1) - 1);
    rec.lastUsedAt = Date.now();
  };
}
```

Gateway/proxy/peek: `const unpin = this.processes.pin(alias)` around `ensure`+`proxyJson`/`peekSpecialist`, `unpin` in `finally`.

`sweepIdle` / `evictForNewSpecialist`: skip `rec.refs > 0`. `resume()` after SIGCONT: probe `/health`; if not ready, `stopRecord` and cold-start. Clamp `idle_evict_ms >= upstream_timeout_ms` (Cursor: 180s or disable suspend-on-idle while refs>0).

`ensure` resume path must set `starting` and run on `coldStartChain` (P6).

**Tests:**

- pin, then `sweepIdle` with `now = lastUsedAt + idleEvictMs + 1` → not stopped
- unpin, then sweep → stopped/suspended
- `evictForNewSpecialist` with max_warm=1 leaves the pinned victim; incoming `ensure` 503s or waits, does not SIGSTOP
- resume without `/health` 200 → restart, not `state='ready'`

---

## RF3 — machine thread budget (with covert F5)

**Invariant (operator lock, Researcher 2026-09-03):** 4-thread resident **default**, 6-thread **sprint**. Σ `--threads` of live llama-server processes ≤ `os.cpus().length`. Empty profile still gets `--threads 4`. Never retry a higher thread count after timeout (P10). **Do not drop Cursor/Note9 nexus to 2.**

Arithmetic:

- This Cursor host is 8-way: nexus 4 + specialist 4 = 8, admitted. Sprint `cpu-6` needs 6 remaining; after nexus 4 only 4 remain → **refuse** `cpu-6`.
- 4-way laptop: nexus 4 ⇒ remaining 0 ⇒ specialist CPU set empty ⇒ **do not spawn** (no wrap, no `cpu-6` retry). That is refuse-oversubscribe, not a nexus-2 rewrite.
- Windows nexus `cpu-2` + `vulkan-all` rewrite stays as shipped.

`process-manager.mjs` `buildLaunch`: if no `--threads`, inject 4 (default). After F5 `allocateSets`, empty set → throw `UnavailableError` `cpu_oversubscribed`. Skip a profile whose `--threads` > remaining CPUs (so `cpu-6` is a sprint only when remaining ≥ 6). `start()` on timeout/OOM must not continue to a larger `--threads` profile.

Keep `config/agents.cursor.json` nexus `cpu-4` / specialist `cpu-4` + `cpu-6`. F5 tests that assume nexus 2 stay valid for Windows; add a Cursor case: `allocateSets(8, [{nexus:4},{spec:4}])` disjoint cover 8; `allocateSets(8, [{nexus:4},{spec:6}])` specialist empty; `allocateSets(4, [{nexus:4},{spec:4}])` specialist empty.

**Tests:** `start()` mock that fails `cpu-4` does not attempt `cpu-6`. Empty allocator set → no spawn. Cursor manifest nexus `--threads` remains 4.

---

## RF4 — health is this PID; port free is fail-closed

**Invariant:** `waitForReady` returns only if `record.child.exitCode === null` **after** a successful probe. `stopRecord` returns only after `exit` (SIGKILL is not enough). `waitForPortsFree` treats timeout as occupied and **throws**.

`waitForReady`: after `probe.ready(response)`, `if (record.child.exitCode !== null) throw`. Optional: compare `/props` pid if llama exposes it.

`stopRecord`: `await exited` after SIGKILL; do not `Promise.race` return while `exitCode === null`. Then `waitForPortsFree`. `processes.delete` on failed `startProfile`. Refuse `startProfile` while `state === 'stopping'`.

`waitForPortsFree`: `catch` of `/health` with timeout → still occupied (connection refused / ECONNRESET = free; AbortError = occupied). Deadline → throw, so `evictForNewSpecialist` does not start the incoming model.

**Tests:** fake child that exits during fetch → not `ready`. Fake `/health` 200 from a different listener while child dead → not `ready`. `stopRecord` does not resolve until `exit` event. `waitForPortsFree` with a hanging fetch does not return ok.

---

## RF5 — hop observation follows completion; peek waits for slot 0

**Invariant:** `observeHop('success')` runs only after `proxyJson` / `deliverPeek` completes without timeout. Failure → `agent_unavailable` / `timeout`. Peek abort does not `hops.push` twice. Next POST to that port waits until `/slots` `is_processing === false` or a short busy backoff; no 503-retry onto a just-aborted `--parallel 1` slot.

`completeOnResident` / text fallback / peek deliver: move `observeHop('success')` to after the await. `proxyJson`: do not 503-retry while RF2 refs > 0 on that alias (fail fast or wait idle).

`handleChatTurn` peek_timeout branch: remove the second `hops.push(alias)` (already pushed at 1046). After `hopAbort.abort()`, `await waitSlotIdle(port)` (GET `/slots`, 50–100ms poll, cap ~2s). Covert F13 restore only after that idle.

**Tests:** fake `proxyJson` throw 504 → mailbox last event `kind !== 'success'`. Peek timeout → `hops` contains alias once; next ensure not called until slot idle mock flips false→true. `proxyJson` 503 with refs>0 does not loop until `retry_deadline_ms`.

---

## RF6 — one hop publish; logger fail-closed

**Invariant:** a hop is one envelope. If IPC `ok !== true`, mailbox does not keep a lone success. Logger missing path / flood / write error returns `{ok:false, dropped:true}` (or throws). Gateway does not `catch {}` capability rejects.

`Gateway.observeHop`:

```js
observeHop(kind, source, extra = {}) {
  const posted = this.ipc.observeHop(kind, source, extra);
  if (!posted || posted.ok !== true) {
    // optional: mailbox.push reject copy for HTTP recent — not a success
    return posted;
  }
  this.mailbox.push({
    kind, source: source ?? '', ticket: extra.ticket ?? '',
    payload: extra.payload ?? {}, seq: posted.seq,
  });
  const emitted = this.logger.emit({ kind: kind || 'hop', ... }, { callerRole: 'ipc' });
  if (emitted && typeof emitted.then === 'function') {
    emitted.then((r) => { if (r && r.ok === false) {/* already rejected */} });
  }
  return posted;
}
```

`createLogger`: `if (!path && !options.write) throw` or return `{ok:false}` from `emit`. Flood and `catch` of write: `{ok:false, dropped:true}`. Cap `chain` (F22). Gateway must pass a path if audit is required; default no-op writer is gone.

**Tests:** IPC stub/missing-cap → mailbox `pushed` unchanged. Logger no path → `ok:false`. `inFlight >= 4` → `ok:false, dropped:true`. Gateway observeHop does not swallow a thrown `assertCaller`.

---

## RF7 — mailbox drain snapshots; kinds match IPC

**Invariant:** `drain` callbacks cannot extend the same while-loop. Monitor-critical kinds (`lockdown`/`reboot`/`vote`/empty) **reject**, not `{ok:true}` (B12 + fuzz m002). Drop-oldest remains best-effort only for `hop`/`success`/`agent_unavailable`.

`Mailbox.drain`: copy `n = this.size` events out first (like `CopyRing.drainCopies`), then notify. `listeners.slice()`. `_scheduleDrain` `try/finally`; reschedule if `size > 0`.

`push`: if kind is stub/unknown, return `{ok:false}` (or delegate to IPC). Do not store lockdown-shaped success.

**Tests:** listener that `push`es during drain → second event delivered on the **next** drain, and drain returns. `push({kind:'lockdown'})` → `ok:false`. Existing drop-oldest still works for `kind:'hop'`.

---

## RF8 — IPC seq is occupancy identity

**Invariant:** `_enqueue` always stamps `copy.seq` from `this.seq`. Caller seq is metadata only. `wait()` dedupes on occupancy id. First reject is not process-global forever (F19).

`_enqueue`: always `copy.seq = u64(this.seq.hi, this.seq.lo)` after `u64Inc`. `wait` key = ring seq, not caller seq.

Reject cache: per-`MonitorIpc` (or none); TTL / cap keys (F19). Re-enqueue if ring/`byTicket` dropped it.

Mailbox: if dual-post copies IPC seq, `stats().seq` matches envelope seq (`{hi,lo}`).

**Tests:** two pushes with the same caller seq → `wait` returns both (or both with distinct stamped seqs). Overflow drop then new reject → new reason, not the cached first. `byTicket` size capped.

---

## RF9 — finite HTTP lifetime; HEAD does not wait for a body

**Invariant:** `server.requestTimeout` default is finite (suggest 180_000, same as upstream). HEAD `/health` (and other GET-family) does not advertise a body the client must read. Malformed TE/CL connections die at `headersTimeout`, not forever (`requestTimeout` 0 today).

`listen()`: `server.requestTimeout = this.manifest.gateway.request_timeout_ms ?? 180_000`. Health handler: if `request.method !== 'GET' && request.method !== 'HEAD'` → 405. HEAD: `Content-Length: 0` or no body headers.

**Tests:** `requestTimeout` not 0 in default listen. HEAD `/health` answers without a JSON body. (Do not add a 6s integration stall.)

---

## Council (fold into RF1 + RF2)

`handleCouncil` takes `policy.acquire`. `spec.parallel === true` is ignored unless every alias is ready **and** `aliases.length <= maxWarmSpecialists` **and** RF3 CPU sets all non-empty. Never evict an alias in the current council set (RF2 refs).

---

## Entropy / NTP (small; with B25)

- Entropy: missing CREDIT cap → reject envelope. Unknown source → reject, do not alias to `voluntary_feed`. `{ready:false}` is terminal for v1 enroll (no spin). If `call` is a respond verb → reject, do not credit (B25).
- Votes: never default TTL to forever; use `process.hrtime.bigint()` for expiry. No NTP module in v1 — do not fail-open a missing cap by pretending wall clock is synced; just don’t use `Date.now()` as the only TTL base.

---

## Files

| File | RF |
|---|---|
| `src/scheduler.mjs` | RF1 |
| `src/process-manager.mjs` | RF2, RF3, RF4 |
| `config/agents.cursor.json` (keep nexus 4; skip `cpu-6` at runtime) | RF3 |
| `src/gateway.mjs` | RF1 council, RF2 pin, RF5, RF6, RF9 |
| `src/proxy.mjs` | RF5 no 503-retry while pinned |
| `src/handoff.mjs` | RF5 slot idle after abort |
| `src/monitor/logger.mjs` | RF6 |
| `src/mailbox.mjs` | RF6 seq copy, RF7 |
| `src/monitor/ipc.mjs` | RF6, RF8 |
| `src/monitor/states.mjs` | RF8 / F19 |
| `src/monitor/entropy.mjs` | ENT1 |
| `src/monitor/respond.mjs` | NTP TTL |
| `src/constants.mjs` | optional `DEFAULT_THREADS`, default request timeout |
| `src/cpu-set.mjs` | covert F5 — do not fork |
| `test/scheduler.test.mjs` | new |
| `test/{process-manager,gateway,mailbox,monitor-ipc,proxy,handoff}.test.mjs` | extend |

---

## Out of scope

- git push, tree patch in this pass, reboot, vote, lockdown enablement
- CUDA / SAB lock-free ring (keep copy-only; spec comment vs JS occupancy is documentation)
- Trust-boundary CSRF/API key (B1/B2) except where it creates a hang (RF9 HEAD)
- Covert padding payloads / stego
- Raising `--parallel` above 1

---

## Done when

- `responsive` abort cannot stick `active`
- a live hop cannot be SIGSTOP’d / checkpointed / F13-restored
- 4-CPU box cannot launch 4+4 (specialist refused); 8-way admits 4+4 and refuses 4+6
- `/health` 200 is this child
- mailbox/IPC recent cannot show `success` for a failed hop
- logger and mailbox lockdown kinds do not return `ok: true` on drop/stub

---

## Compose with fuzz-fixes + platform (delta)

Do not double-implement. Fuzz-fixes owns Fuzz-1/2 (`messages` 400) and Fuzz-5 (throw→reject). Race owns:

- **RF7 = Fuzz-11 / Fuzz-4:** drain snapshot + kind allowlist. Fuzz p060 reproduced the livelock (50001 callbacks). Ship RF7 with that test bound, not a second drain rewrite.
- **RF9 = Fuzz-13 / Fuzz-3:** GET/HEAD/OPTIONS have no body wait; dump routes 405 except GET. TE-chunked `/health` hung 15s in fuzz pass-2.
- **RF4 += PLAT-S1:** `stop` / `stop.sh` must reap **all** owned llama ports (live evidence `:8184` survives 8080+8187-only kill) and wait bind-free before return. CLI `stop` must not construct a fresh empty `ProcessManager`. No `/stop` route until it exists. Do not run pack `stop.sh` as the fix.
- **PLAT-I1:** Platform owns PATH-vs-pack ELF. RF4 only: failed `startProfile` must delete the record and wait the port (already RF4).

RF3 unchanged: 4 default / 6 sprint; live 4+4 on this 8-way host is admitted.

- **PLAT-P1:** Platform/B14 fail-closed `${}`. RF4 only covers the failed spawn leftover (record/port). Do not rewrite `expandEnvironment` here.

---

## Pass-4 RF4 cut (2026-09-06) — landed

Applied on `/workspace/green-roomz` per Researcher. Three residuals closed in `src/process-manager.mjs`; tests in `test/process-manager.test.mjs` (36/36). No git push. No stop.sh. See `/workspace/reviews/race-pass4.md`.

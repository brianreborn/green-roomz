# Race review: warm specialists (qodesh Windows dogfood)

Athlon II X2, 2 logical CPUs. `canSuspend` is false on Windows (no SIGSTOP); eviction already terminates. This note is what landed vs what stayed open.

## Fixed

### C1 — empty/default profile oversubscribe

`orderProfiles` still synthesizes `{ id: 'default', args: [] }` when `profiles` is empty. That path used to inject `--threads 4` (`DEFAULT_THREADS`) even on a 2-CPU box.

- `defaultThreadCount()` is `min(DEFAULT_THREADS, logical CPUs)` (at least 1).
- Empty/default launches use `implicitThreadCount()`: that cap, further clamped to the remaining CPU set so a resident nexus already holding a core does not get a 2-thread roommate from an empty profile.
- Explicit `--threads` in a profile is unchanged; oversubscribe still skips that profile.
- `agents.windows-mvp.json` empty profile lists were left empty: the code default is enough.

### H3 — council `parallel:true` bypasses `max_warm_specialists`

`handleCouncil` pinned every in-flight alias (`refs > 0`), so `evictForNewSpecialist` would not evict, and `spec.parallel === true` started N cold specialists at once.

- `ProcessManager.canParallelCouncil(aliases, requested)` is false when the non-resident alias count exceeds `maxWarmSpecialists`.
- Gateway uses that gate. `pin()` during a turn is still fine; starting more cold specialists than `maxWarm` in parallel is not. Serial path evicts between variants.

### L3 — failed start left an `exited` map row

`startProfile` inserted a record, then on health/exit failure called `stopRecord` without deleting the map entry. The exit handler set `state: 'exited'` and left the zombie.

- Failed start deletes the row (exit handler also deletes if it still owns the key).
- A later `ensure` cannot observe an `exited` record.

### H1 (cheap, with L3) — allocator leak on exit

The child `exit` handler now `cpuAllocator.release(alias)`. `release` is idempotent with `stopRecord`. Unexpected death after ready no longer leaks the CPU set.

## Deferred

### H2 — dual CPU budget

`start()` remaining uses `liveThreadSum(processes)`; `startProfile` then `cpuAllocator.allocate`. Two ledgers. C1's implicit default takes `min` of both; explicit profiles still have both checks. Unifying on one allocator is a larger change.

### M1 — evict thrash

`evictForNewSpecialist` plus `sweepIdle` can bounce the same specialist on a tight `max_warm_specialists: 1` box. Serial council is slower but correct; no hysteresis/cooldown added.

### M2 — similarity judge embed without pin

`judgeCouncil('similarity')` `ensure`s `semantic-embedding-agent` and fetches without `pin()`. Idle sweep / a competing specialist can kill it mid-judge. Left alone: gateway edits this round are only the council parallel block.

### M3 — suspend latent

Windows cannot `SIGSTOP`. `canSuspend` stays false; evict terminates. No fake POSIX suspend.

## Tests

`node --test .\test\process-manager.test.mjs` plus C1/H3/L3 cases there. H3 also has a gateway council concurrency test (`test/gateway.test.mjs`).

# Covert-channel checkpoint (2026-09-07)

Reviewer: Covert Channel Reviewer. Host: qodesh (Win11 Athlon II X2, 16 GB, 8600 GT display-only). Scope: `src/timing-quant.mjs`, `src/mailbox.mjs`, `src/monitor/ipc.mjs`, gateway hop `holdMs`, plus local docs. No production patch. No exploit recipe. Grok Bot’s `/workspace/reviews/covert-checkpoint-2026-09-07.md` is not on this disk.

Covert Fixer is limited to `src/timing-quant.mjs` only.

## Executive

Hop padding exists (`QUANT_MS = 50`, `holdMs` after PolicyGate release on council / direct-alias / chat-turn). It does not hide Athlon tok/s or nexus-peek vs specialist-keep. On this box a token is ~330 ms; a 50 ms remainder pad is sub-token. HTTP already left the socket before the sleep. Mailbox envelopes carry unquantized `ts` and variable payload size. Windows has no SIGSTOP, so there is no suspend/resume covert here; eviction is terminate + cold start (loud, not a pause channel).

## tok/s / latency vs nexus peek (bug)

Measured floor: qodesh CPU llama **3.0 tok/s** (`docs/fleet-targets.md`, Direct 8187 8-tok). One generated token ≈ **333 ms**. Nexus consult is a **non-stream** JSON completion, `NEXUS_MAX_TOKENS = 96`, abort `NEXUS_CONSULT_TIMEOUT_MS = 25_000`. Specialist hops use `peekSpecialist` (SSE until `HANDOFF_PEEK_CHARS = 48` or keep), then `deliverPeek` for the rest of the stream. `MAX_SPECIALIST_HOPS = 3`.

Classes a local observer can already tell apart by wall time (HTTP TTFB / total, PolicyGate occupancy, CPU):

| class | typical shape on Athlon |
|---|---|
| slash / lock hard-rule | no nexus consult |
| nexus consult + HANDOFF peek | short JSON + ~48 chars then next hop |
| nexus consult + specialist keep | consult + full generation |
| offline plan (consult fail / timeout) | consult bound, then regex plan |
| cold `ensure` vs already-ready | mmap/KV vs hot |
| `/route` plan | consult without `holdMs` |

`holdMs` is remainder-to-next-50 ms **after** `jsonResponse` / `proxyJson` / `deliverPeek` in a `finally` that also `release()`s the policy slot. The client sees the true hop duration. The pad only delays the next acquire. `Date.now()` on Win11 is a coarse wall clock (often ~15.6 ms), so the 50 ms grid is not a clean lattice anyway.

Council is worse: the JSON body includes per-variant `ms`. That is an explicit latency side channel, out of Fixer scope.

**Severity: bug.** 50 ms quantum is the wrong scale for 3 tok/s and for nexus-peek vs keep. Remainder padding after the response cannot close the channel.

## Mailbox envelope size / timing (suggestion)

Live mailbox (`src/mailbox.mjs`) and monitor IPC (`src/monitor/ipc.mjs`) share field names: `seq`, `kind`, `source`, `ticket`, `ts`, `payload`, `target`.

Size:

- String `payload` longer than 256 chars becomes a 64-hex sha256. Objects are a **shallow** copy. Hop payloads (`reason`, `hops[]`, `visited`) stay in the clear and are not hashed. Nested objects are not bounded.
- Packed research slot is `SLOT_BYTES = 16` (seq+ticket only). The JS copy ring is the live path: occupancy 256 hot / 16 upcall, drop-oldest, not a mapped host buffer.
- `recentLimit` 64 keeps full envelopes. Gateway `observeHop` writes IPC + mailbox + logger. Logical monitor snapshot returns `mailbox.recent()` / `stats()`. `/v1/monitor/recent` is another observer.

Timing:

- `ts` is unquantized `Date.now()` at push. It lines up with HTTP and with PolicyGate better than `holdMs` does.
- `push` is non-blocking (tests require &lt; 10 ms, no inline drain). Drain is `setImmediate` (one event-loop tick), not a quantum. Slow listeners do not stall `push`; they still run on the same loop as the next hop.
- Live hops use numeric `seq` + string `ticket`. Monitor IPC may use `{hi,lo}`. Sequence and drop counts are traffic volume, not a tok/s meter, but they correlate with hop count.
- `wait(ticket)` is copy-out, not a blocking rendezvous.

**Severity: suggestion.** Envelope `ts` and object-payload size leak hop class. Do not treat the 16-byte packed slot as if it were the live covert surface. Fixer must not grow mailbox; if they add a clock helper in `timing-quant.mjs`, it should be something gateway/mailbox could call later for `ts` quantization — not a mailbox patch in this pass.

## Windows cannot SIGSTOP (nit / fact)

`process-manager.mjs`: `canSuspend = gateway.suspend_evicted === true && process.platform !== 'win32'`. Default is off even on POSIX. `suspendImpl` is `SIGSTOP`; `resumeImpl` is `SIGCONT`. Comments: POSIX-only; Windows terminates; GPU-pinned VRAM is never freed by suspend; PF7 forbids SIGSTOP of a bound LISTEN llama-server.

On qodesh:

- There is **no suspend covert** (no freeze/thaw of a loaded GGUF as a signal).
- Eviction is terminate + later cold `ensure`. That is a **load-time** channel (seconds, disk, RAM), not a pause channel.
- Do not invent NtSuspendProcess, job-object freeze, or a Windows `suspendImpl` in this review’s Fixer scope.

**Severity: nit** (document the OS fact so Covert Fixer does not “compensate” with a tiny quantum or a fake suspend delay).

## What Covert Fixer should change (`timing-quant.mjs` only)

Current module: `QUANT_MS = 50`, `ceilQuantum(elapsed)` via `(e + Number.EPSILON) / n`, `holdMs(startedAt, now = Date.now(), q)` returns `ceilQuantum(elapsed) - elapsed` (0 when already on a slot).

Do:

1. **Raise the default quantum to Athlon-token scale**, not 50 ms. Floor is one measured token (~330 ms at 3.0 tok/s). Prefer a named constant and keep `q` overridable so gateway can pass a coarser hop-class quantum later without editing this file twice.
2. **Integer ceil.** Drop `Number.EPSILON` float bump. `elapsed` is ms; use `Math.ceil(e / n) * n` with `e = 0` still mapping to one full quantum (today’s empty-hop behavior).
3. **Do not return a deterministic 0 remainder** when already on-slot. Exact multiples are a distinguishable “landed on the grid” bit. Add a small dither inside the module (one extra quantum or bounded jitter) so `holdMs` is never a pure function of wall remainder.
4. **Monotonic elapsed.** Default `now` should not be Win11 `Date.now()` coarseness if the caller can pass `performance.now()`. Export one clock helper and document that `startedAt` and `now` must be the same clock. Do not mix `Date.now()` start with `performance.now()` now.
5. **Keep the contract** “ms to sleep after PolicyGate release.” Do not encode SIGSTOP, mailbox drain, or HTTP hold here. Do not sleep inside `holdMs`.

Do not:

- Patch `gateway.mjs` (move sleep before `jsonResponse`, pad `/route`, strip council `ms`) — out of scope this pass; those remain bugs.
- Patch mailbox/IPC size or `ts`.
- Emulate suspend on Windows.
- Add host-specific if/Athlon branches that read tok/s from disk; a constant + `q` argument is enough.

## Out of Fixer scope (still true)

- Response headers `x-green-roomz-hops` / `effective-alias` / `route-reason` name the hop (content channel, not timing).
- `handleRoutePlan` consults nexus with no `holdMs`.
- Council body `variants[].ms`.
- Cold-start vs ready is larger than any honest quantum; hiding it would add seconds of pad and still fail on RAM/CPU.

## Freeze

`holdMs` remains “remainder after gate release.” Envelope fields stay as frozen. Windows: no SIGSTOP covert. Next Fixer: `timing-quant.mjs` quantum + integer ceil + dither + one clock, nothing else.

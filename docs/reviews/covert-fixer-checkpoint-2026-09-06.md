# Covert Fixer checkpoint (2026-09-06)

Fixer: Covert Channel Fixer. Host: qodesh (Win11 Athlon II X2). Scope this pass: `src/timing-quant.mjs` + `test/timing-quant.test.mjs`. Grok Bot’s `/workspace/reviews/covert-fixer-checkpoint-2026-09-06.md` was not on this disk. Reviewer board used: local `docs/reviews/covert-checkpoint-2026-09-07.md`. No git commit/push. No serve bounce. No process-manager / gateway routing / android edits.

## What landed

`src/timing-quant.mjs` was a 50 ms integer-ish remainder (`Number.EPSILON` bump, deterministic 0 on-slot, `Date.now` only). Gateway already called `holdMs(startedAt)` after PolicyGate `release()` on council / direct-alias / chat-turn. That wiring is unchanged.

Changes in `timing-quant.mjs`:

| item | now |
|---|---|
| Default quantum | `TOKEN_MS = QUANT_MS = 330` (one measured 3.0 tok/s Athlon token). `q` still overridable. |
| Integer ceil | `ceilQuantum`: `e === 0` → one full quantum; else `Math.ceil(e / n) * n`. No `Number.EPSILON`. |
| On-slot | `holdMs` never returns 0. Zero remainder gets an extra quantum when dither is 0. |
| Dither | Injectable `random` (default `Math.random`) adds `0..q-1`. Same remainder can yield different holds. |
| Clock | `quantClock()` → `performance.now()`. `holdMs` still defaults `now` to `Date.now()` so it matches gateway’s existing `startedAt`. Same-clock rule is documented; do not mix. |
| Bucketed delays | `bucketDelay(ms)` ceils a planned wait (0 stays 0). |
| `ts` helper | `quantizeTs(ts)` floors onto the quantum (mailbox/IPC can call later; not patched here). |
| Hang cap | `MAX_HOLD_MS = 2000`. Remainder + dither cannot eat `NEXUS_CONSULT_TIMEOUT_MS` (25 s). |
| Sleep | Still not inside `holdMs`. No SIGSTOP, no HTTP hold, no Win32 suspend. |

Win32 15.6 ms tick (`WIN_TICK_MS = 16`) is below the 330 ms bucket, so the pad is actually coarse on this box.

## Wiring

Already present in `src/gateway.mjs` (not edited):

- `handleCouncil` finally: `release(); holdMs(startedAt); sleep`
- `handleDirectAlias` finally: same
- `handleChatTurn` finally: same

No new call sites. Race eviction / process-manager untouched. `/route` still has no `holdMs` (reviewer: out of Fixer scope).

## Tests

`test/timing-quant.test.mjs` (node `--test`, no live llama):

- quantum ≥ token floor and `2 * QUANT_MS` / `MAX_HOLD_MS` ≪ 25 s
- integer `ceilQuantum` including empty hop
- `bucketDelay` / `quantizeTs`
- on-slot `holdMs` > 0; dither changes the remainder pad
- huge `q` clamped to `MAX_HOLD_MS`
- `quantClock` is monotonic and not unix epoch

## Still true (not this pass)

- HTTP already left the socket before the `finally` sleep. Client TTFB/total still sees true hop duration.
- 330 ms remainder does not hide nexus-peek vs specialist-keep, cold `ensure` vs ready, or council `variants[].ms`.
- Mailbox/IPC `ts` and object-payload size still unquantized.
- Windows has no SIGSTOP covert; eviction stays terminate + cold start.

## Freeze

`holdMs` remains “ms to sleep after PolicyGate release.” Envelope fields unchanged. Next owner who may touch gateway: move pad before `jsonResponse` / `proxyJson`, `/route` hold, council `ms` strip — not this Fixer.

# Timing privacy (install choice)

Cross-box (HTTP TTFB/total to another machine) is why the covert concern was raised. Same-host occupancy still matters for multi-proc / CPU-set pinning (`next_acquire`), but that is a different observer and must not be “solved” by sleeping after the client already got the body.

## Modes (`gateway.timing_privacy`, required)

| mode | What it does | Observer |
|---|---|---|
| `off` | No pad. Usable dogfood. | — |
| `next_acquire` | Remainder `[0, q)` after PolicyGate `release()`. | Same-host next turn / CPU slot |
| `response` | Same remainder **before** first client byte (`beforeClientWrite`). | Cross-box TTFB. Streams still leak after the first byte. |

Optional: `timing_privacy_quantum_ms`, `timing_privacy_dither` (dither stays **inside** the current bucket; never `pad + U[0,q)` and never `0 → q`).

Missing key → validate/serve refuse. Windows MVP is explicitly `"off"`.

## Why the elementary mistakes happened

1. **Wrong observer, right-looking knob.** `holdMs` runs in `finally` after `jsonResponse` / `proxyJson`. A remote client already saw the duration. Reviewer wrote that, then still told the fixer to raise the default quantum to 330 ms.
2. **Scope trap.** Fixer owned only `timing-quant.mjs` and was forbidden to move the sleep onto the HTTP path, so the only “fix” was making an off-path pad bigger.
3. **Stacked delay.** Remainder `pad` plus independent `U[0,q)` plus `if wait===0 then wait=q` is not a bucket. It is up to almost two quantums, or the **maximum** when already aligned. `MAX_HOLD_MS` was a bandage on that sum.
4. **Tests ossified it.** `timing-quant.test.mjs` asserted QUANT=330 and on-slot never 0.
5. **Not the primary dogfood slowness.** Old 50 ms remainder after the stream was 0–49 ms on the next acquire. Athlon pain was 3 tok/s, nexus hang, cold specialists, empty-profile 4-thread oversubscribe — not this pad. The 330 ms stacked default **would** have been.

Do not treat “more padding” as security unless the sleep sits on the observer’s path.

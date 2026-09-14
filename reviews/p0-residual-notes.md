# P0 residual notes (post fuzz-pass4)

- When: 2026-09-06 ~05:12 AM PT
- Tree: `/workspace/green-roomz` (src) + live `/workspace/e2e-fresh/green-roomz` on :8080
- Did **not** patch `src/`. Did **not** overlay. Did **not** TERM/bounce :8080. Did **not** stop llama :8187. Did **not** git push.

## Live re-check (raw TCP + Node rawRequest, same shapes as fuzz-pass4)

| Case | Observed | Verdict |
|---|---|---|
| Fuzz-6 POST /route missing Content-Type + JSON body | HTTP **400** ~1–4ms `validation_error` | PASS (already live) |
| Fuzz-6 POST /route empty Content-Type + JSON body | HTTP **400** ~1–2ms `validation_error` | PASS (already live) |
| Fuzz-6 POST /route text/plain + JSON | HTTP **400** ~1ms (known from pass4) | PASS |
| RF9 TE-chunked GET /health (no chunks) | HTTP **400** ~1ms, no stall | PASS (already live; pass4 stall not reproduced) |
| RF9 HEAD /health | HTTP **200** ~1ms, `content-length: 0`, no body | **LOCKED** |

## HEAD /health = 200 is intentional (RF9)

Fuzz-pass4 judged `HEAD /health` FAIL because its runner required status **400**. That judge is wrong relative to integrate-refinement / race RF9 / covert F24:

- RF9 / F24: HEAD fail-closed means **no multi-second body/parser wait**, not “must 400”.
- Race RF9 tests: `requestTimeout` finite; HEAD `/health` answers **without a JSON body** (`content-length: 0`).
- Live HEAD is **200 in 1ms**, bodyless — constant timing, no stall.

**Do not** change HEAD `/health` to 400 or 405 to chase the fuzz judge. HEAD **200** (fast, no body) is the locked constant.

## Pass4 residual disposition

Fuzz refreshed context: **54 PASS / 1 FAIL**; the single residual is HEAD→200. Treat that FAIL as a **fuzz-judge mismatch**, not a product P0.

| Pass4 residual | Disposition |
|---|---|
| Fuzz-6 missing CT hang ~8s | Cleared on live re-check (400 fast). No further CT work. |
| Fuzz-6 empty CT hang ~8s | Cleared on live re-check (400 fast). No further CT work. |
| RF9 TE-chunked GET stall ~6003ms | Cleared on live re-check (400 ~1ms). No further TE work. |
| RF9 HEAD /health → 200 1ms | **Intended.** Locked. Do not “fix” to 400/405. |

## Code / bounce

- **No `src/` change** this residual pass.
- **No e2e-fresh overlay**, **no TERM of node :8080**, **no stop.sh**, **llama :8187 untouched**.

## Outcome

**No code fix required.** CT missing/empty and TE-chunked GET already fail closed fast on live. HEAD `/health` **200** bodyless <500ms is the RF9 locked behavior.

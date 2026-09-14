# Green-Roomz covert-channel review — pass 3

Follows `/workspace/reviews/integrate-refinement.md`. **Do not fork.** Tree still frozen: no `src/` patch, serve left up.

Date: 2026-09-03 ~04:51 AM PT.
Baseline: pass1 `covert-review.md`, pass2 `covert-pass2.md`, defense `covert-fixes.md`.
This cut’s covert P0 (from the refinement, not a new list): stream `timings`; F4 U+2028/U+2029; gate llama `/slots`; refuse `extra_args` bind `0.0.0.0`; HEAD fail-closed; publish-after-complete. Homoglyphs **stay after F4**.

---

## Binding

- F1 `holdMs` sleeps **after** PolicyGate `release()`, not inside `proxyJson`.
- F13 restore only `refs=0` **and** slot `is_processing=false` (RF2) — leak view: until then, slot-0 residue (CC-8) and `/slots` (CC-P2-1) remain.
- F14 this cut = `--no-webui`, no `--metrics`, **gate `/slots`**, refuse `0.0.0.0`. **No** llama API-key product (P2).
- GET `/v1/monitor/recent` 200 stays OK; hashed tickets this cut; session-local dump is P1 F11.
- Nexus stays **4** threads on this Cursor box. Not a covert change.
- Platform pass-1/2/fixes are **pending-but-present**, not this security cut. Cite only.

---

## P0 this cut — still leaking (tree unpatched)

### F1 — client streams still carry llama `timings` (CC-1)
- file: `src/proxy.mjs:30,80,107-110`
- current: `canSanitize = !body?.stream`; stream path `writeHead(downstreamHeaders)` then `pipeline` upstream body. `sanitizeCompletionJson` deletes `timings` only on the buffered path. Parse failure (`:96-97`) forwards raw even when non-stream (CC-P2-17).
- leaks: `timings` / tok/s / prompt-eval fields to the HTTP client on `stream: true` (direct-alias / text-fallback). Handoff SSE **does** sanitize (`handoff.mjs:356,369,375`).
- to: HTTP client
- refinement expected: client stream chunks have **no** `timings`; `holdMs` after `release()`
- status: **open**

### F4 / B18 — U+2028 / U+2029 still in `stripControls` / `stripEscapes` / `headerSafe` (CC-P2-6)
- file: `src/util.mjs:129-146`
- current: C0/C1 + OSC/CSI only. No U+2028/U+2029. No ZW. No bidi.
- leaks: LS/PS in route headers and consult/HANDOFF `reason`
- to: HTTP client (header); subsequent nexus prompt
- refinement expected: U+2028/U+2029 stripped; one-char class tests; **no homoglyph fold**
- status: **open**
- residual **after** this cut (P2, explicit): homoglyphs of CC-2; platform PLAT-L2 also names U+202A–U+202E and U+2066–U+2069. P0 table is 2028/2029 only — do not widen F4 this cut.

### F14 — llama `/slots` ungated; `0.0.0.0` not refused (CC-P2-1, CC-P2-16, CC-10)
- file: `src/process-manager.mjs:158,231,306`; live `GET http://127.0.0.1:8187/slots` → **200** (1 slot, `n_prompt_tokens` 212, `is_processing` false, cache fields, sampler `params`)
- current: no `--no-webui`; no `--metrics` (live `/metrics` 501); `extra_args`/`profile.args` concatenated with **no** host-bind check (`:306`). Gateway `/slots` still 404.
- leaks: slot prompt-size / cache occupancy / `is_processing` to any loopback client of `:8187`. A hostile `extra_args --host 0.0.0.0` would export that off-box (shipped cursor.json is `127.0.0.1`).
- to: loopback process (shipped); any peer if bind widened
- refinement expected: `--no-webui`; never `--metrics`; refuse `0.0.0.0`; still no gateway proxy of `/slots`
- status: **open**

### RF9 / F24 — HEAD not fail-closed (CC-P2-3)
- file: `src/gateway.mjs:1175-1176` (`requestTimeout` default **0**); dump routes run before POST-only check (`:356-385`)
- current live: GET `/health` 200; **POST `/health` 200** (6626 bytes); HEAD `/health` 200 with `content-length: 6626` and no body (curl 18 / ~6s class, same as fuzz h012)
- leaks: dump bodies on non-GET; HEAD duration vs GET
- to: HTTP client (no API key)
- refinement expected: default `requestTimeout` finite (180s); HEAD `/health` no body wait; POST/PUT/DELETE dumps → **405** (Fuzz-3 / F-B30, same apply-order step)
- status: **open**

### RF5 / F27 — publish-after-complete not done (CC-5/CC-6 integrity)
- file: `src/gateway.mjs:503-520` (`observeHop('success')` **then** `proxyJson`); also `:479`, `:553`, `:594`, `:1058`, `:1096`, `:1125`
- current: mailbox/IPC can show `success` while the client later sees 504/abort. Peek abort does not wait `is_processing===false`.
- leaks: cross-client hop log (`/v1/monitor/recent`) reports success for unfinished work; slot still busy (pairs with CC-P2-1 `is_processing`)
- to: HTTP client reading monitor dump; next caller of the same alias
- refinement expected: fake 504 → last hop `kind !== 'success'`; peek abort → alias once; next hop waits `is_processing===false`
- status: **open**

---

## Homoglyphs (explicit residual)

CC-2 homoglyphs **stay after F4**. No decoder, no confusable fold, no tests that recover bits. Trailing space/ZW/LS are F4’s job; lookalikes are P2 leftover.

---

## P1 covert (not this cut — still leaking)

Still open vs pass1/pass2; refinement parked them P1. Do not treat as this-cut scope:

| ID | leak | to |
|---|---|---|
| F-B3 / F11 | nexus may pick MONITOR; dump not session-local | HTTP client / model-chosen route |
| F-B19 / F8a | upstream headers forwarded; stamps clobber | HTTP client |
| F-B21 / F18 | error `details` / health paths | HTTP client |
| F3 / F8 | `cache_prompt` + other slot fields forwarded | llama-server same alias |
| F2 | unpadded nested mailbox payload; occupancy on `/health` | HTTP client |
| F6 | `--poll 0` cursor-only | co-resident on android/windows/note9 |
| F7/F9/F10 | image/WAV/whisper unsanitized stores | HTTP client |
| F-B13 | `logger.read` omit role | in-process |

---

## P2 (demoted)

`/metrics` PIDs/RAM (CC-7), council `ms` (CC-12), route headers (CC-14), proxied `usage` (CC-16), `serve.log` tok/s (CC-21), bench tps (CC-24), android/note9 warm cap. API-key product demoted: loopback remains v1 trust boundary.

---

## Platform (cite only)

Boards: `platform-review.md`, `platform-pass2.md`, `platform-fixes.md`. Not this `src/` cut.

- **PLAT-S1** leftover llama ports: live **`:8184` and `:8187`** both LISTEN (pids 1904007 / 1903795) plus gateway 1849424. Same `/slots` leak as F14 on every leftover port. Do not kill serve to “prove” it.
- **PLAT-L2** bidi in reasons: P0 F4 covers U+2028/U+2029 (refinement table). Extra bidi isolates (U+2066–U+2069) stay residual with homoglyphs.
- Path/installer/l10n otherwise out of covert this cut.

---

## Live snapshot (pass 3)

- `:8080` node 1849424; POST `/health` 200; no `Server-Timing` on GET.
- `:8187` llama `/slots` 200.
- `:8184` extra llama LISTEN (PLAT-S1).
- Tree unpatched: no `timing-quant.mjs`, no `stripZeroWidth`, no host-bind refuse.

---

## Done when (covert slice of the beta-0.3 gate)

From the refinement, leak view:

- Client streams have **no** `timings`.
- U+2028/U+2029 gone from headers/reasons/completions; homoglyphs **still present**.
- Loopback `:818x/slots` gated (or unreadable); `extra_args` cannot bind `0.0.0.0`.
- HEAD `/health` is not a multi-second stall; POST dumps are 405.
- Monitor hops are not `success` before the body finishes.

No recipes. Next pass only if Researcher folds another refinement.

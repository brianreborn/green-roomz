# Green-Roomz fuzz fix pack

Date: 2026-09-03. Tree: `/workspace/green-roomz`. Pass-2: `/workspace/reviews/fuzz-pass2.md`. First board: `/workspace/reviews/fuzz-review.md`.
**Do not patch yet** — Researcher integrates with race-fixes / boundary-fixes / covert-fixes.

ID lock (Researcher P0, do not renumber): **Fuzz-1/2** messages 500/string, **Fuzz-3** GET-family 405, **Fuzz-4** mailbox allowlist, **Fuzz-5** `complex-last` → reject envelope.

Failing cases + expected reject/constant behavior only. No exploit PoCs. No WAN. Uncallable lockdown/reboot/secure_reboot **reject**, never throw, never `ok:true`, never execute. 8080 stays POST|OBSERVE|SNAPSHOT.

Shared (do not double-implement):

- F-B2 Content-Type application/json (Fuzz-6)
- F-B30 / LIVE-H2 dump routes GET-only (Fuzz-3)
- B12 / RF7 mailbox kind allowlist (Fuzz-4)
- B4 respond.uncallable() for reboot-class (Fuzz-5)
- F-B7 empty CORS (Fuzz-7)
- B11 NIC reject-before-mutate (Fuzz-8)
- B5 grade must not name reboot verbs (Fuzz-9)
- B14 `${}` allowlist (Fuzz-10)
- RACE-M1 drain snapshot (Fuzz-11)
- B13 logger role (Fuzz-12)
- RF9 / LIVE-H1 HEAD/TE fail-fast (Fuzz-13)
- B6 omitted mask default-deny (Fuzz-14)
- B8 / CC-5 / B3 monitor ticket dump (Fuzz-15)
- CC-9 `cache_prompt` strip (Fuzz-16)

Expected reject envelope (already in tree, `src/monitor/respond.mjs:326-341` + `decorateReject`):

```js
{ kind: 'reject', ok: false, executed: false, implemented: false, spawned: false, voted: false }
```

Expected HTTP validation (`src/errors.mjs:11-15`):

```js
throw new ValidationError(message); // status 400, code validation_error
```

---

## P0

### Fuzz-1 — non-array `messages` must 400, not 500

**Failing:** POST `/v1/chat/completions/route` `messages=42` / `true` / `{}` / `1.5` → **500** `internal_error` (“number 42 is not iterable”), 1–3ms (c001–c004).

**Files:** `src/routing.mjs:24-30` `detectModalities`; also `:43-48` `latestUserMessageText`; `:51-52` `audioDataFromBody`; `:64` `isExplicitTranslationRequest` (`.flatMap`); `hardRuleRoute` `:335-336`. Catch-all `src/gateway.mjs:402-412`.

**Expected:** if `messages` is present and `!Array.isArray(messages)`, throw `ValidationError('messages must be an array')` **before** any `for…of` / `.length` / `.flatMap`. Null/missing may stay `[]`. HTTP 400 `validation_error`, never 500.

**Tests:** those four bodies → 400. `messages=[]` / omitted still 200 on `/route`. Process stays up.

### Fuzz-2 — string `messages` must 400, not char-iterate

**Failing:** `messages="hi"` → **200** 885ms (c005). Strings are iterable so the same loop walks code units.

**Files:** same guards as Fuzz-1. `Array.isArray` is the constant; `?? []` is not enough.

**Expected:** 400 `validation_error`. Do not treat a string as a message list.

### Fuzz-3 — GET-family method check

**Failing:** POST/PUT `/health`, PATCH `/v1/health`, DELETE/POST `/v1/models`, PUT `/metrics` → **200** (h040–h045).

**Files:** `src/gateway.mjs:353-385` (method check only starts at `:386` for inference).

**Expected:** `/health` `/v1/health` `/v1/models` `/props` `/metrics` `/v1/monitor/recent` → **405** unless GET (OPTIONS 204 after peerAllowed). Same as F-B30. POST chat routes stay POST-only (h047 already 405 on GET).

**Tests:** POST/PUT/DELETE those paths → 405. GET still 200. OPTIONS still 204.

### Fuzz-4 — Mailbox.push kind allowlist

**Failing:** `Mailbox.push({kind:'lockdown'|'reboot'|'vote'})` → `{ok:true}` (m001–m003). `MonitorIpc.push` of the same kinds → reject (m004–m005). Drain does not execute verbs.

**Files:** `src/mailbox.mjs:108-132` vs `src/monitor/ipc.mjs:333+`. Gateway dual-write `src/gateway.mjs:448-456`.

**Expected:** reboot-class / vote / unknown kind → `{kind:'reject', ok:false}` (or do not store). Hop/observe kinds only, same table as IPC. Cross-link B12 / RF7.

**Tests:** push lockdown/reboot/vote → `ok:false`. push hop → `ok:true`. `/v1/monitor/recent` does not grow a lockdown envelope from mailbox-only write.

### Fuzz-5 — uncallable verbs reject, never throw `complex-last`

**Failing:** `ipc.lockdown/reboot/secure_reboot`, `isolate.lockdown/reboot`, `network.lockdown/reboot`, `api.vote/secureReboot` throw `Error('complex-last')` (p001–p003, p020–p021, p030–p031, p070–p071). HTTP 8080 still cannot reach these methods. `respond.*` already reject (p010–p012).

**Files:** `src/monitor/ipc.mjs:313-331`; `src/monitor/isolate.mjs`; `src/monitor/network.mjs:238-241`; `src/monitor/api.mjs:94-100`. Correct shape: `src/monitor/respond.mjs:326-341`.

**Expected:** every lockdown/reboot/secure_reboot entry returns `respond.uncallable()` / `makeReject` / `{kind:'reject', ok:false, executed:false}`. Do not throw. Do not `ok:true`. Do not execute. Missing cap bit is still reject, not throw (B6). Cross-link B4.

**Tests:** those methods return `ok:false` and `executed:false`. No throw. HTTP lockdown/reboot stay 404.

---

## P1

### Fuzz-6 — require `Content-Type: application/json`

**Failing:** missing CT / `text/plain` / `text/html` / empty CT with valid JSON body → **200** on `/route` (c020, c024, c026, c027). Non-JSON bodies already 400.

**Files:** `src/gateway.mjs:386-395`. Same as F-B2.

**Expected:** if POST content-type (type/subtype, ignore params) is not `application/json` → 400 `ValidationError('Content-Type must be application/json')` before parse. Keep bearer as a non-simple header.

**Tests:** missing/`text/plain`/`text/html` → 400 even when body is valid JSON. `application/json` still 200/4xx from routing.

### Fuzz-7 — CORS must not reflect port-80 localhost

**Failing:** `Origin: http://localhost` and `http://127.0.0.1` set `Access-Control-Allow-Origin` on `/v1/monitor/recent` and `/route`; OPTIONS preflight 204 (c040–c044).

**Expected:** F-B7 — default `cors_origins` empty; never list bare `http://localhost` / `http://127.0.0.1`. Unknown origin never sets ACAO.

### Fuzz-8 — NIC stub must reject before `setState`

**Failing:** `network.freeze/reset/halt('eth0')` returns `ok:false` but state moved up→frozen/resetting/halt (p032–p034). In-memory stub only.

**Expected:** B11 — reject **before** `setState`. After reject, state unchanged.

### Fuzz-9 — grade must not advertise reboot-class `verb`

**Failing:** policy `grade-stop` → `ok:true verb:lockdown`; `grade-wipe` → `ok:true verb:secure_reboot` (p040–p041), `executed:false inert:true`.

**Expected:** B5 — grade result has no reboot-class `verb` field. Missing cap → reject.

### Fuzz-10 — `${}` expansion fail-closed

**Failing:** missing key → empty string (`pre--post`); empty `GRZ_ROOT` → `/runtime/llama-server`; `${constructor}` → native Object function (e001, e003, e004).

**Files:** `src/util.mjs` `expandEnvironment`. Not HTTP.

**Expected:** B14 — allowlist keys; `Object.hasOwn(env, key)` only; empty/relative-after-expand command/model paths reject. Prototype keys do not interpolate.

### Fuzz-11 — mailbox drain must snapshot before listeners

**Failing:** listener `push` during `drain` → 50001 callbacks in 64ms, livelock=true, capped (p060).

**Expected:** RACE-M1 / RF7 — steal the batch first (like IPC `drainCopies`); cap listener-push recursion.

### Fuzz-12 — logger default-deny

**Failing:** `emitRole('sad')` remaps to monitor and emits `ok:true` (p050). `read` with omitted `callerRole` returns the chain (p051).

**Expected:** B13 — do not rewrite SAD→monitor. Missing role on `read` → reject, not dump.

### Fuzz-13 — TE/HEAD on GET routes fail fast

**Failing:** GET `/health` Transfer-Encoding chunked with no chunks → client abort 15s this pass; retry 200 6ms. Pass 1 answered 200 in ~6s. HEAD was 1ms this pass (pass 1 ~6s). Duplicate Content-Length already 400 (c047).

**Expected:** RF9 / LIVE-H1 — do not wait on a body for GET/HEAD/OPTIONS. TE+no-chunks or CL on GET → 400 immediately.

---

## P2 (follow-up IDs; do not collide with P0)

### Fuzz-14 — omitted `rightsMask` default-deny

**Failing:** `createIsolate()` / `createNetwork()` with no mask: `map` / `down('eth0')` → `ok:true`. `rightsMask:0` correctly rejects (p022, p035 vs p023, p036).

**Expected:** B6 — omitted mask default-**deny**. Same reject envelope as mask=0. Instance mask explicit.

### Fuzz-15 — monitor HTTP must not export live tickets

**Failing:** GET `/v1/monitor/recent` after a chat → events `seq,kind,source,ticket,ts,payload,target`; payload `reason,hops`. Monitor-alias chat returns the same mailbox dump (c051, c053). `/route` pin of that model is plan-only (not the dump).

**Expected:** B8 / CC-5 / B3 / F-B8 — omit or hash `ticket`. Do not return live session UUIDs. 200 on the read route is OK; the dump shape is the bug.

### Fuzz-16 — drop llama slot fields on the gateway hop

**Failing:** POST `/route` with `cache_prompt:true` plus extra slot fields → 200 (c033). Body spread in `prepareInferenceBody` (`gateway.mjs:176-181`).

**Expected:** CC-9 / covert F3 — drop `cache_prompt` and other llama slot fields on live hops. `/route` 200 for a plan is OK if extras are stripped, not forwarded.

---

## Not failing (do not “fix” into execution)

- HTTP `/lockdown` `/reboot` `/secure_reboot` and slash-as-path stay **404**. Keep uncallable; do not add routes.
- `respond.*` reboot-class already returns the reject envelope — use it as the template.
- compile-prompt not expanding `${}` is OK.
- 32k header 400 and duplicate Content-Length 400 are acceptable fail-closed.
- stream `timings` **not** observed on 1-token SSE this pass (CC-1 still a code-path finding on `proxy.mjs` stream branch; not reproduced on this tiny completion).

No git push. No reboot. No product-tree patch in this pack.

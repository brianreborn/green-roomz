# Green-Roomz boundary fix pack

Date: 2026-09-03. Tree: `/workspace/green-roomz`. **Do not patch** — Researcher applies P0 from `/workspace/reviews/integrate-refinement.md`. Pass 3: `/workspace/reviews/boundary-pass3.md`. Do not fork that stitch.

API-first. No frozen `REPLICAS=3`. Uncallable lockdown/reboot/secure_reboot **reject**, never throw, never `ok:true`. No exploit steps. Tests assert status/envelope/constants only.

Shared with other packs (do not double-implement):

- Covert-fixes §2: hash mailbox/IPC payloads (covers B24).
- Covert-fixes §3: force `cache_prompt: false` on live hops (covers B28).
- Covert-fixes §4: `stripEscapes` drops U+2028/U+2029 (covers B18 if `stripControls`/`headerSafe` also call it or share the class).
- Race G1 / RF6 / RF7: IPC as source of truth + mailbox kind allowlist (covers dual-write half of B12). Race owns drain snapshot; we own reboot-class reject.
- Race LIVE-H2: dump routes GET-only (F-B30).

---

## P0 — this cut (integrate-refinement apply order 4 + 8)

Loopback stays the v1 trust boundary. **No API-key product.** Non-loopback fail closed. Never mint `'loopback-dev'` for a non-loopback peer.

### F-B2 Require `Content-Type: application/json`

**Files:** `src/gateway.mjs:386-395`

Before `readBody`/`JSON.parse` on POST:

```js
const ct = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
if (ct !== 'application/json') {
  throw new ValidationError('Content-Type must be application/json');
}
```

Empty CORS (F-B7) already forces a preflight for cross-origin; JSON CT is the body gate.

**Tests:** missing CT / `text/plain` / empty CT on POST mutating → **400 even if body is JSON**. `application/json` still 200/4xx from routing, not 500.

### F-B7 Empty default CORS

**Files:** `config/agents.windows.json:16-19`, `config/agents.cursor.json:16-19`, `config/agents.android.json`, `config/agents.note9.json`; `src/gateway.mjs:140-148`

- Default `cors_origins` to `[]`. Same-origin only.
- If a console origin is needed, list it **with port** (`http://127.0.0.1:8080` is same-origin and does not need CORS).
- Reject a list entry of `*`. Do not add `Access-Control-Allow-Credentials`.
- Run `peerAllowed` **before** the OPTIONS 204 (`gateway.mjs:341-344` currently returns CORS before the peer check).

**Tests:** `Origin: http://localhost` no longer reflected. Unknown origin never sets ACAO. OPTIONS from a denied peer is 403, not 204.

### F-B8 Do not export live session tickets

**Files:** `src/gateway.mjs:359-365`, `:448-455`, `:1057-1066`; `src/mailbox.mjs:108-118`

- `observeHop` ticket field: store an HMAC or truncated hash of the session id, not the raw UUID.
- `GET /v1/monitor/recent` and monitor-alias snapshot omit `ticket` or emit only the hash.
- Shared `'loopback-dev'` stays this cut. Hashed tickets so a dump cannot be replayed as `x-session-id`.
- `SessionLedger.patch` (`sessions.mjs:39-46`): allowlist keys (`faith`, `fear`, `confidenceMood`, `yolo`, `councilDefault`, `op`, `rebuke`, `agentAlias`, `lastAccess`). Never `Object.assign` `id` / `identity` / `expiresAt` / `createdAt`.

**Tests:** `/v1/monitor/recent` has no UUID-shaped `ticket`. `patch(id, { identity: 'authenticated', expiresAt: 0 })` does not change those fields. Session-local dump is P1 F11.

---

### F-B30 Dump routes are GET-only

**Files:** `src/gateway.mjs:341-385`

`/health`, `/v1/health`, `/v1/models`, `/props`, `/metrics`, `/v1/monitor/recent` must `405` unless `GET` (and `OPTIONS` after `peerAllowed`, see F-B7). Race LIVE-H2: a stuck POST body on a “read” URL pins the parser. Boundary: method is not a capability gate today.

**Tests:** POST/PUT/DELETE those paths → 405. GET still 200 (loopback, no key).

---

### F-B27 `messages` must be an array

**Files:** `src/routing.mjs:24-30`, `:43-49`, `:51-61`, `:63-66`; `src/gateway.mjs` POST handler after JSON.parse

At the gateway, after object-shape check:

```js
if (body.messages != null && !Array.isArray(body.messages)) {
  throw new ValidationError('messages must be an array');
}
```

Defensively, every `for...of body.messages` uses `Array.isArray(body?.messages) ? body.messages : []` **or** throws. `isExplicitTranslationRequest` must not `.flatMap` a number.

**Tests:** `messages: 42` / `"x"` / `{}` → 400, never 500. A string body must not be walked as characters. Cover `/v1/chat/completions` as well as `/route`. Omitting `messages`: 400 on inference; `/route` may stay empty-plan 200 if documented.

## P1 — Validation at the HTTP boundary

### F-B9 Always prepend stock prompt

**Files:** `src/gateway.mjs:162-173`

Remove the 24-character `includes` short-circuit. Always unshift the compiled stock prompt as the first system message. If a de-dupe is needed, compare the **entire** first system message to `policy`, or a gateway-owned marker you insert (not client-searchable prefix of agency.md).

**Tests:** existing `test/gateway.test.mjs` prepend cases stay. Add: client system message containing `# Green-Roomz agent` still results in stock prompt at `messages[0]`.

### F-B20 Exact route paths

**Files:** `src/gateway.mjs:19-30`, `:194-196`, `:198-201`, `:353-354`

- Drop `url.pathname.endsWith('/route')`. Only `/v1/chat/completions/route` is plan-only (`EXPLICIT_ROUTES` already has it).
- `isChatPath`: exact `=== '/v1/chat/completions'` (and embeddings/rerank exact). No `endsWith('/chat/completions')`.
- Inference target path is the allowlisted pathname, never `request.url`.

**Tests:** `POST /evil/route` and `POST /foo/chat/completions/route` → 404.

### F-B28 Allowlist upstream JSON (share Covert-fixes §3)

**Files:** `src/gateway.mjs:176-191`

After inject:

```js
delete payload.cache_prompt;
delete payload.cache_prompt_save;
payload.cache_prompt = false;
```

Prefer an allowlist (`messages`, `model`, `max_tokens`, `temperature`, `stream`, `stop`, `tools`, …). Drop unknown keys. Do this for every alias including nexus. Prime on the **agent port** may keep `cache_prompt: true`.

**Tests:** covert-fixes already specify fetchImpl records upstream body; client `cache_prompt: true` arrives `false`. Add: unknown `slot_id` does not appear upstream.

### F-B21 Redact HTTP `details`

**Files:** `src/gateway.mjs:407-412`; `src/registry.mjs:34-37`

HTTP error `details` and `/health` `unavailable_reasons` use codes (`runtime_missing`, `artifact_missing`), not expanded paths. Full paths stay on stderr.

**Tests:** `/health` JSON does not contain `/workspace/` or `GRZ_ROOT`. 503 body has no filesystem path.

---

## P2 — Model output and headers

### F-B3 Nexus must not select MONITOR / logical

**Files:** `src/nexus.mjs:151-179`, `:187`; `src/gateway.mjs:1057-1066`

```js
// routeIsBad
if (route === MONITOR_ALIAS) return 'monitor is not a consult target';
if (registry.get(route)?.runtime === 'logical') return 'logical is not a consult target';

// allowlistedPlan
const candidates = /* same set as nexusCandidateAliases */;
if (!candidates.has(route)) return { ...plan, route: null, reason: stripControls(plan.reason ?? '') };
```

Mailbox snapshot only on **explicit** `body.model === MONITOR_ALIAS` or `GET /v1/monitor/recent`. Do not key off `record.logical`.

**Tests:** consult JSON `{"route":"security-monitor-agent"}` does not hop there (falls back). Explicit pin still snapshots.

### F-B18 Strip U+2028 / U+2029 in `stripControls`

**Files:** `src/util.mjs:129-146`

Extend `stripControls` (used by `headerSafe` and nexus reason) to replace `\u2028\u2029` (and other Z separators) with space. Share the covert-fixes F4 class rather than a second regex if both land; `headerSafe` must not emit LS/PS.

**Tests:** existing fuzz `HEADER_UNSAFE` mid-string LS in `body.model` / consult `reason` is stripped. Do not add encode/decode cases.

### F-B19 Allowlist downstream headers

**Files:** `src/proxy.mjs:21-24`, `:91-107`; callers `src/gateway.mjs:505-520`, `:921-936`, `:1127-1129`

`downstreamHeaders` copies `content-type` only. Then `writeHead(status, { ...allowlisted, ...routeHeaders() })` so 8080 stamps win. Never copy upstream `set-cookie`, `location`, `access-control-*`, or `x-green-roomz-*`.

**Tests:** fake upstream `x-green-roomz-effective-alias: forged` and `set-cookie` do not appear; gateway alias header does.

---

## P3 — Monitor capability abuse

Template: `respond.uncallable()` (`src/monitor/respond.mjs:326-341`) → `{kind:'reject', ok:false, executed:false}`. `replicaCount` stays 1.

### F-B4 Uncallable reboot-class rejects, never throws

**Files:** `src/monitor/network.mjs:238-241`; `src/monitor/isolate.mjs:276-279`, `:433-446`; `src/monitor/ipc.mjs:313-331`; `src/monitor/api.mjs:94-100`; `src/monitor/policy.mjs:164-171`

Replace `throw new Error('complex-last')` with `rejectOf` / `makeReject` / `uncallable()`. Policy `check`/`map` for `stop`/`wipe` returns `ok:false`, `kind:'reject'`, **no** `verb: 'lockdown'|'secure_reboot'`. Do not return `ok:true` + `inert:true`.

**Tests:** `ipc.lockdown()`, `isolate.lockdown()`, `network.lockdown('machine')`, `api.vote`/`secureReboot` return reject envelopes. No test may encode throw-as-success. Update tests that currently expect `'complex-last'`.

### F-B5 Grades do not name reboot verbs

**Files:** `src/monitor/policy.mjs:27-32`, `:61-66`, `:153-171`

- Drop `verb` from grade results, or map only to non-reboot kinds (`observe` / `down`).
- `capabilityMissing`: `caps == null` → **true** (default-deny).
- Keep grade type and verb type disjoint.

**Tests:** SAD `check({kind:'grade', payload:{grade:'wipe'}})` has no `verb: 'secure_reboot'` and `ok:false` unless the instance holds `SECURE_REBOOT` (which SAD must not).

### F-B6 Default-deny bits; bits gate before uncallable

**Files:** `src/monitor/ipc.mjs:78-101`, `:313-339`; `src/monitor/network.mjs:114-126`; `src/monitor/isolate.mjs` `capabilityMissing`; `src/monitor/respond.mjs:149-165`

- Missing mask ⇒ missing cap ⇒ reject.
- `KIND_CAP` includes `lockdown`/`reboot`/`secure_reboot` mapped to those bits.
- Check the bit **before** the uncallable reject so the reason is `missing capability` vs `uncallable` as appropriate.
- Instance `this.rightsMask` wins over `opts.rightsMask` unless the caller is the capability authority (place/respond). Gateway stays `POST|OBSERVE|SNAPSHOT`.
- `CAP_DEFAULT` must not include `GRADE` / reboot bits.

**Tests:** `createNetwork()` with no mask: `lockdown('machine')` reject missing-cap or uncallable, never throw. `push({kind:'lockdown'})` reject missing bit, not “unknown kind” only.

### F-B10 Bind role/mask to the instance

**Files:** `src/monitor/ipc.mjs:333-335`; `src/monitor/isolate.mjs:190-192`; `src/monitor/network.mjs` `apply`; `src/monitor/respond.mjs:117-119`

Ignore per-call `opts.role` / `opts.rightsMask` elevation. `network.apply` calls `assertCaller`. Default isolate/network/respond to unprivileged role + empty mask.

**Tests:** worker-constructed ipc cannot pass `rightsMask: CAP_ALL` and succeed a gated call.

### F-B11 Reject before `setState`

**Files:** `src/monitor/network.mjs:264-280`

If `nicStub` or unimplemented: `return rejectOf(...)` **before** `setState`. State unchanged.

**Tests:** `freeze('eth0')` leaves `stateOf('eth0')` as before; envelope `ok:false`.

### F-B12 Gate `Mailbox.push` (with Race G1)

**Files:** `src/mailbox.mjs:108-132`; `src/gateway.mjs:448-468`

Allowlist hop-class kinds only (`success`, `agent_unavailable`, `route_exhausted`, `hop`). Unknown / reboot / vote / grade → `{ok:false, kind:'reject'}` and do not enqueue. If Race G1 lands, publish through `MonitorIpc` first and copy into mailbox only on `ok:true`; do not `catch {}` IPC rejects.

**Tests:** `push({kind:'lockdown'})` → `ok:false`, `recent()` unchanged. Hop kinds still enqueue.

### F-B13 Logger default-deny

**Files:** `src/monitor/logger.mjs:75-79`, `:168-169`

- Delete SAD→monitor rewrite.
- `read`: missing `callerRole` → reject, do not dump.
- Missing sink / write failure → `{ok:false, dropped:true}` (Race LIVE-LOG1). Gateway must not `catch {}` that.

**Tests:** `emit({callerRole:'sad'})` denied. `read({})` denied.

### F-B25 / F-B26 Entropy, gate, IPC push

**Files:** `src/monitor/entropy.mjs:180-209`; `src/monitor/gate.mjs:80-85`; `src/monitor/ipc.mjs:333-401`

If `call` is a respond verb, return reject envelope; do not credit/begin. `push` uses the same `CALL_TABLE` as `post`. `kind:'grade'` requires SAD/policy **and** `CAP.GRADE`.

**Tests:** `credit({call:'lockdown'})` → `ok:false`. Worker `push({kind:'grade'})` → `ok:false`.

---

## P4 — Config / pack (not HTTP-reachable except B16)

### F-B14 Allowlist `${}`

**Files:** `src/util.mjs:32-40`

```js
const ALLOW = new Set(['GRZ_ROOT', 'GRZ_EXE', 'HOME']);
export function expandEnvironment(value, env = process.env) {
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, key) => {
      if (!ALLOW.has(key) || !Object.hasOwn(env, key)) throw new Error(`unset ${key}`);
      return String(env[key]);
    });
  }
  // ...
}
```

`GRZ_EXE` is `''` or `'.exe'` only. Fail closed if `GRZ_ROOT` unset when the manifest uses it. Do not concatenate unsanitized `GRZ_EXE`.

**Tests:** missing key throws; `${constructor}` does not read the prototype; unknown key throws.

### F-B15 Confine `resolveManifestPath`

**Files:** `src/util.mjs:43-46`; `src/config.mjs:82-87`, `:96-97`

After resolve, `realpath` and require the result under pack root + `policies/` or `models/`. Reject absolute/UNC that escape. Kernel bind: directory **and** basename.

**Tests:** `../` and `C:\...` candidates throw. Shipped `policies/<KERNEL_BASENAME>` still load.

### F-B17 Pin pack extracts

**Files:** pack `start.cmd`, `deploy-android.sh`

Pin SHA-256 of the GitHub asset. Extract to a fresh temp dir; refuse members that are absolute or contain `..`; copy only expected names into `runtime\`.

---

## Test / docs churn

- Replace tests that expect throw `'complex-last'` for reboot-class with reject-envelope asserts.
- Add `test/config.test.mjs` cases for `expandEnvironment` / `resolveManifestPath` (currently none).
- Fuzz suite: `messages=number` becomes 400; missing CT becomes 400 once F-B2 lands.

## Out of this pack

PolicyGate deadlock, health/PID, in-flight refcount, GGML threads, success-before-complete, timing pad, CPU affinity, media-scan, `--poll 0`. Those stay on race / covert-fixes.


---

## P2 — demoted (not this cut)

### F-B1 Default-on auth / API-key product

**Deferred.** Loopback is the v1 operator trust boundary. Do not mint a bearer in start.sh this cut. Covert F14 does **not** invent `--api-key` on llama unless the operator reopens this.

When reopened: `src/gateway.mjs:35-43`. Non-loopback still fail closed. Never `'loopback-dev'` for a non-loopback peer. Per-token principal replaces the two shared labels.

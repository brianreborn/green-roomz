# Green-Roomz boundary review

Trust boundaries, data validation, capability abuse. Not races/liveness. No exploit steps.

Trees: `/workspace/green-roomz` (identical `src/gateway.mjs` in `/workspace/e2e-fresh/green-roomz`).

Attackers:

- **H** — HTTP client on `127.0.0.1:8080` (do not treat loopback as forever-trusted).
- **M** — untrusted model token stream (often prompt-influenced).
- **P** — local in-process caller of monitor/config APIs, or llama-server on the agent port.
- **E** — inherited env / tampered `--manifest` / pack extract (not HTTP).

`respond.uncallable()` (`src/monitor/respond.mjs:326-341`) is the correct reboot-class shape: `{kind:'reject', ok:false, executed:false}`. `replicaCount` defaults to 1; nothing here freezes `REPLICAS=3`.

---

## High

### B1. Unauthenticated loopback HTTP is a full operator

- **file:** `src/gateway.mjs:35-43`, `:104`, `:322-327`, `:351-401`
- **attacker:** H (any local process that can open a TCP socket)
- **impact:** Unset `GREEN_ROOMZ_API_KEY` (pack default) makes `identityFrom` always `'loopback-dev'` after the peer check. Loopback always passes `peerAllowed`. HTTP never checks `CAP.*`; `GATEWAY_IPC_RIGHTS` only constrains the gateway’s own IPC object. That client can start specialists, pin any routable alias, mutate session `/faith` `/fear` `/confidence` `/yolo` `/council`, dump hops via `GET /v1/monitor/recent` or `model: security-monitor-agent`, and read `/metrics` `/props`. Vote/lockdown/reboot are not HTTP-exposed. With `allow_peers` and no API key, the same shared identity is issued off-loopback.
- **fix:** Default-on bearer (or a local token). Never return `'loopback-dev'` for non-loopback peers. Gate mutating routes and snapshot/metrics on a real principal. Keep IPC bits; add an HTTP-level gate so inference/snapshot are not implicit for every accepted peer.

### B2. Request bodies are JSON-parsed regardless of `Content-Type`

- **file:** `src/gateway.mjs:386-395`
- **attacker:** H, including a browser as confused deputy
- **impact:** After the POST check, content-type is never inspected. `text/plain` and missing `Content-Type` are CORS-simple, so a cross-origin form/fetch can fire inference, cold-starts, and session creates without a preflight. Combined with B1 this is a CSRF path onto the mutating surface. (Private Network Access may block public site → localhost; it does not block other local origins, native apps, or non-browser clients.)
- **fix:** Require `Content-Type: application/json` before `readBody`/`JSON.parse`. Keep a non-simple header (`Authorization` or a custom token header) so browsers preflight.

### B3. Nexus `route` can select MONITOR; logical hop dumps the global mailbox

- **file:** `src/nexus.mjs:151-179`, `:187`; `src/gateway.mjs:1057-1066`
- **attacker:** M (nexus completion). H can already pin `model: security-monitor-agent` on purpose.
- **impact:** `nexusCandidateAliases` omits `MONITOR_ALIAS`, but `allowlistedPlan` only checks `registry.agents.has(route)` and `routeIsBad` does not block monitor. A 0.5B that ignores the grammar can pick `security-monitor-agent`. That alias is `runtime: "logical"` and always ready, so `handleChatTurn` returns `this.mailbox.recent()` (all sessions’ tickets and hop reasons) as assistant content. Session ids are reusable under the shared identities `'loopback-dev'` / `'authenticated'` (B8).
- **fix:** In `routeIsBad` and `allowlistedPlan`, reject `MONITOR_ALIAS` and any `runtime === 'logical'` unless the caller explicitly pinned it. Do not key the mailbox dump off “logical”; keep snapshot on the explicit monitor pin / `GET /v1/monitor/recent` only. Accept-list consult routes as `Set(candidates)`, not “in registry”.

### B4. Uncallable lockdown / reboot / secure_reboot throw or succeed inert, instead of reject

- **file:** `src/monitor/network.mjs:238-241`; `src/monitor/isolate.mjs:276-279`, `:433-446`; `src/monitor/ipc.mjs:313-331`; `src/monitor/api.mjs:94-100`; `src/monitor/policy.mjs:164-171`
- **attacker:** P (in-process monitor API). HTTP 8080 cannot reach these methods.
- **impact:** Policy requires uncallable reboot-class to **REJECT** (`kind:'reject', ok:false`), not no-op and not throw. Throw is not a reject envelope. Policy `ok:true` + `inert:true` is a silent success; with a non-8080 `respondProcess` (e.g. port 9090), `stop→lockdown` is `ok:true`, `inert:false`. Callers that treat non-throw / `ok:true` as authorized will record a successful raise. `respond.mjs:326-341` already returns the reject envelope.
- **fix:** Every lockdown/reboot/secure_reboot entry (methods, `apply`, grade/map) returns `makeReject` / `{kind:'reject', ok:false}`. Do not throw `'complex-last'`. Do not return `ok:true` for reboot-class. Align isolate/network/ipc/policy with `respond.uncallable()`.

### B5. Grade advertises reboot-class verbs without the matching cap bit

- **file:** `src/monitor/policy.mjs:27-32`, `:61-66`, `:153-171`
- **attacker:** P with `check` (`CALL_TABLE`: ipc, sad). HTTP does not call `createPolicy`.
- **impact:** Grade names are not verbs, but the API returns `verb: 'lockdown'` / `'secure_reboot'` on a successful grade. SAD is denied those calls in `CALL_TABLE`, yet posting grade `stop`/`wipe` yields the verb without `LOCKDOWN` / `SECURE_REBOOT`. `capabilityMissing` returns false when no mask is set. `watch→observe` is also a kind, not a `states.VERBS` verb.
- **fix:** Grade results must not include reboot-class `verb` fields. Default-deny: missing mask => reject. Require the verb’s cap bit (or refuse to name the verb) before any map/check result. Keep grade type and verb type disjoint.

### B6. Reboot-class cap bits exist but do not gate the verbs

- **file:** `src/monitor/ipc.mjs:58-79`, `:81-101`, `:313-331`; `src/monitor/network.mjs:57-85`, `:114-126`; `src/monitor/isolate.mjs:23-48`, `:112-125`; `src/monitor/respond.mjs:70-85`, `:149-165`
- **attacker:** P. HTTP gateway mask does not include these bits (OK for 8080).
- **impact:** `CAP.LOCKDOWN` / `NET_CAP.LOCKDOWN` / `ISO_CAP.LOCKDOWN` / `RESPOND_CAP.LOCKDOWN` are advertised. Verbs remain callable (throw or inert-ok) without those bits. IPC `KIND_CAP` has `vote` but not `lockdown`/`reboot`/`secure_reboot`; `push({kind:'lockdown'})` is “unknown kind”, never “missing capability bit”. Direct `ipc.lockdown()` throws **without** `hasCap(CAP.LOCKDOWN)`. Network/isolate/respond: if `rightsMask`/`capabilities` is omitted, `capabilityMissing` returns false (default-allow).
- **fix:** Default-deny masks (include bits only for allowed ops). Put lockdown/reboot/secure_reboot in the kind/verb cap table. Check the bit **before** uncallable-reject. Instance mask must win over caller-supplied `opts.rightsMask` unless the caller is the capability authority.

---

## Medium

### B7. Default CORS allowlist trusts port-80 `http://localhost` / `http://127.0.0.1`

- **file:** `src/gateway.mjs:140-148`; `config/agents.windows.json:16-19` (android/note9/cursor the same)
- **attacker:** H — a page served from port 80 on the same machine
- **impact:** CORS is **not** `*`, does not set `Access-Control-Allow-Credentials`, and only reflects allowlisted origins (good vs wildcard). The shipped list is `http://localhost` and `http://127.0.0.1` **without a port** (port 80). That is a different origin from `:8080`. A page on `:80` can **read** `/v1/monitor/recent`, `/metrics`, `/props`, and completion bodies. `authorization` and `x-session-id` are in allow-headers, so once an API key exists that page can also send it.
- **fix:** Default `cors_origins` to empty (same-origin only), or to the exact console origin including port. Never list bare `http://localhost` / `http://127.0.0.1`. Do not put `*` in the list.

### B8. Shared identity; session UUIDs leak on monitor endpoints

- **file:** `src/gateway.mjs:35-43`, `:359-365`, `:471-487`, `:780-782`; `src/sessions.mjs:24-32`
- **attacker:** H (a second local client, or the port-80 CORS page in B7)
- **impact:** `sessions.get(id, identity)` only checks `entry.identity !== identity`. With no key every caller is `'loopback-dev'`; with a key every caller is `'authenticated'`. `GET /v1/monitor/recent` and the monitor snapshot return mailbox/IPC events whose `ticket` is the session UUID (`observeHop` at `gateway.mjs:448-455`). Knowing that UUID, another client can send `x-session-id` / `body.session_id` and patch the victim’s `/faith` `/fear` `/yolo` `/council` default and pin `agentAlias`.
- **fix:** Bind sessions to a per-connection or per-token principal, not a shared label. Do not return live session ids on `/v1/monitor/recent` or in monitor chat snapshots. Require identity match *and* a secret that is not in the mailbox.

### B9. Stock system-policy injection skipped via 24-character substring

- **file:** `src/gateway.mjs:162-173` (`prepareInferenceBody` at `:176-178`)
- **attacker:** H
- **impact:** De-dupe uses `policy.trim().slice(0, 24)` and `String.prototype.includes`. Cognitive agents start with `# Green-Roomz agent` (`policies/frames/agency.md:1`). A client system message containing that prefix skips injection entirely. Specialists then run without agency/handoff/kernel constraints while keeping the client’s own system text. Trust-boundary bypass between client JSON and the agent kernel, not a sandbox escape.
- **fix:** Always prepend the stock prompt. De-dupe by exact first-message equality or a hidden marker you add, not a 24-character substring search over client content.

### B10. Role and rights are caller-claimed; defaults are privileged

- **file:** `src/monitor/ipc.mjs:243-245`, `:333-335`, `:455-457`; `src/monitor/isolate.mjs:190-192`; `src/monitor/network.mjs` (no `assertCaller`); `src/monitor/respond.mjs:117-119`; `src/monitor/logger.mjs:168-169`
- **attacker:** P. HTTP cannot pass `callerRole` / `rightsMask` (gateway hardcodes them).
- **impact:** `opts.callerRole`, `opts.role`, `opts.rightsMask` are taken from the caller. A worker can claim `respond` + `CAP_ALL`. Isolate defaults to `place` (a `grant` caller). Network never consults `CALL_TABLE`, so `down`/`up` and freeze/halt/reset run with no role.
- **fix:** Bind role/mask to the `MonitorIpc` / kernel instance, not the request. Ignore per-call elevation. Call `assertCaller` in `network.apply`. Default isolate/network/respond to an unprivileged role + empty mask.

### B11. NIC “reject-stubs” commit the transition then return reject

- **file:** `src/monitor/network.mjs:264-280`
- **attacker:** P (`createNetwork().freeze('eth0')`, `.reset`, `.halt`, `.sleep`). Not HTTP.
- **impact:** Stub that should 403 still mutates `states`. Looks like reject; behaves like success.
- **fix:** Reject **before** `setState`. Illegal/unimplemented verbs must leave state unchanged.

### B12. Mailbox accepts any kind with `ok:true` (no cap, no uncallable reject)

- **file:** `src/mailbox.mjs:108-132` (used by `gateway.mjs:448-456`)
- **attacker:** P with the Gateway `mailbox` reference. HTTP cannot push; it can **read** via `GET /v1/monitor/recent`.
- **impact:** `Mailbox.push` has no kind allowlist and no capability check. A lockdown/vote/grade-shaped envelope is stored and later shown on 8080. `MonitorIpc.push` would reject the same kinds. Two rings, one gated. Drain currently notifies listeners only; it does not dispatch verbs.
- **fix:** Route hops through `MonitorIpc` only, or apply the same kind/cap/uncallable reject in `Mailbox.push`. Do not dual-write an ungated copy.

### B13. Logger ACL: SAD remapped to monitor; `read` unauthenticated if role omitted

- **file:** `src/monitor/logger.mjs:75-79`, `:168-169`
- **attacker:** P. HTTP does not call logger.
- **impact:** `emit` callers are `ipc` and `monitor`. `emitRole('sad')` becomes `'monitor'`, so SAD can emit. `read` callers are `admin` and `respond`; omitting `callerRole` skips `assertCaller` entirely.
- **fix:** Do not rewrite SAD → monitor. Require a role on `read`; default deny. Missing role => reject, not dump the chain.

### B14. Unrestricted `${}` expansion; empty-var path collapse; spawn retarget

- **file:** `src/util.mjs:32-34`; `src/config.mjs:93`; pack `config/agents.cursor.json:26,43`; `config/agents.android.json:21`; `config/agents.note9.json:21,25`; `src/process-manager.mjs:361,426-430`
- **attacker:** E (inherited env; untrusted manifest if `--manifest` or `config/` is attacker-writable). **Not** H — HTTP cannot change `--manifest` or drive expansion.
- **impact:** Every string in the parsed manifest is rewritten from `process.env` (and the env object’s prototype). Missing vars become `""`, so `${GRZ_ROOT}/runtime/llama-server${GRZ_EXE}` becomes `/runtime/llama-server`. `GRZ_EXE` is concatenated onto the filename. Spawn uses `shell: false` (no metacharacters), but the binary path and `LD_LIBRARY_PATH` are still chosen by expansion. Regex is `/gi` (any identifier). `env[key]` is not `Object.hasOwn`, so `${constructor}` resolves on the prototype. No allowlist. `runtime.command` / `runtime.env` are not passed through `resolveManifestPath`.
- **fix:** Allowlist substitution keys; reject empty/relative-after-expand results for command/model/env paths; `Object.hasOwn(env, key)` only; require command/lib paths to stay under pack root; map `GRZ_EXE` to `""` vs `".exe"` rather than concatenating. Fail closed if `GRZ_ROOT`/`HOME` unset when the manifest uses them.

### B15. `resolveManifestPath` has no containment; kernel bind is basename-only

- **file:** `src/util.mjs:43-46`; `src/config.mjs:82-87`, `:96-97`; `src/kernel-text.mjs:21-29`
- **attacker:** E (tampered `--manifest` or writable `config/*.json`). Not HTTP.
- **impact:** Relative candidates resolve with no “must stay under repo/policies/models” check. `../` walks out of the tree. Absolute / `C:\` / UNC paths are returned as-is after env expansion. `loadDeclaredKernel` then `readFileSync`s that path. `kernelBindingIssues` only compares `path.basename`, so any file named `tool-router.md` anywhere is accepted for that alias. Shipped manifests use `policies/<expected>.md` only — OK as shipped. The loader will honor a hostile file.
- **fix:** After resolve, `realpath` and require the result under an allowlisted root (`policies/`, `models/`). Bind kernels to that directory **and** basename. Do not accept absolute/UNC policy paths without the same confinement. Apply the same to `model` / `draft_model` / `projector`.

### B16. Expanded paths (and interpolated env) are echoed to loopback HTTP

- **file:** `src/registry.mjs:34-37`; `src/gateway.mjs:357-368`, `:417-425`; `src/gateway.mjs:35-43`
- **attacker:** H, **after** a manifest containing `${ENV}` was loaded
- **impact:** `/health` and `/v1/models` return `unavailable_reasons` like `runtime:<expanded command>` and `model:<expanded model path>`. Pack start does not set `GREEN_ROOMZ_API_KEY`. A planted `"command": "${GREEN_ROOMZ_API_KEY}"` would show the secret in those fields. Trusted manifests leak `GRZ_ROOT`/`HOME` paths, not secrets.
- **fix:** Return stable reason codes (`runtime_missing`, `artifact_missing`) over HTTP; keep absolute paths in stderr/logs only. Redact env-derived strings. `validateManifest` already bans secret **field names** (`config.mjs:23-32,74-75`) — extend that to ban `${}` of secret-named env keys, or stop expanding anything except the allowlist.

### B17. Pack fetch + extract: no integrity check, extract not confined

- **file:** pack `start.cmd:20-27`; pack `deploy-android.sh:7,32-34`
- **attacker:** E (network MITM or swapped GitHub release asset). Not 8080.
- **impact:** `curl -L` then `tar -xf` into `runtime\` / a temp dir with no digest pin. A hostile zip/tar can write outside the intended directory. `start.cmd` copies `*.dll` from the first nested folder that contains `llama-server.exe`. `deploy-android.sh` then `adb push`es whatever it unpacked.
- **fix:** Pin SHA-256 of the asset; extract to a fresh temp dir; refuse members that are absolute or contain `..`; only copy expected names into `runtime\`.

### B18. `stripControls` / `headerSafe` miss U+2028 / U+2029

- **file:** `src/util.mjs:129-146`; `src/handoff.mjs:16-17`; `src/nexus.mjs:126-127`, `:177`; `test/fuzz-stress.test.mjs:21`
- **attacker:** M (`reason` on consult JSON; HANDOFF `reason`). H can also put LS in `body.model` → `x-green-roomz-requested-alias`.
- **impact:** C0/C1/CR/LF are stripped; Unicode line separators are not. Node will not split HTTP/1.1 on LS, so this is residual vs the suite’s `HEADER_UNSAFE`. Mid-string LS in `Previous HANDOFF:` / consult `reason` **does** split the next nexus prompt, so specialist text can inject extra `Constraint:` / `AVAILABLE:` lines. Next hop is still registry-allowlisted (B3 is the escape).
- **fix:** Strip `U+2028`/`U+2029` (and fold other `Z` separators) in `stripControls` / `safeReason`. Assert mid-string LS in the existing CRLF fuzz using `HEADER_UNSAFE`, not only `/\r|\n/`.

### B19. `proxyJson` copies all upstream headers and can clobber `x-green-roomz-*`

- **file:** `src/proxy.mjs:21-24`, `:91-107`; `src/gateway.mjs:505-520`, `:921-936`, `:1127-1129`
- **attacker:** P (llama-server response headers), not the token stream. H cannot set these via prompts; request→backend already allowlists `content-type` / `accept` / `idempotency-key` (`proxy.mjs:7-18`).
- **impact:** Peek/`deliverPeek` writes gateway headers only (OK). Resident fallback, direct-alias, and text-fallback `setHeader` then `writeHead(upstream.status, downstreamHeaders(upstream))`. Node: writeHead wins on conflict. Identity stamps (`x-green-roomz-effective-alias`, `-route-reason`, `-hops`, `x-session-id`) are not authoritative on those paths; unexpected `set-cookie` / `location` / upstream CORS would also be forwarded.
- **fix:** Allowlist downstream headers (`content-type` only). Pass `routeHeaders()` into `writeHead` **after** that allowlist so 8080 stamps win.

---

## Low

### B20. Any pathname ending in `/route` is treated as a live route-plan endpoint

- **file:** `src/gateway.mjs:19-30`, `:194-196`, `:353-354`, `:783-786`, `:835-906`
- **attacker:** H
- **impact:** Unknown paths 404 unless they are in `EXPLICIT_ROUTES` **or** `url.pathname.endsWith('/route')`. `POST /evil/route` creates a session and may `consultNexus` instead of 404. It does **not** forward that extra path to llama.cpp (plan-only is decided before `handleDirectAlias`/`handleChatTurn`). Residual: unexpected planner/nexus wake-ups and session minting.
- **fix:** Allow only `/v1/chat/completions/route` (already in `EXPLICIT_ROUTES`). Drop the `endsWith('/route')` fallback. Pass a normalized allowlisted pathname into inference, never raw `request.url`.

### B21. Error `details` are returned unredacted

- **file:** `src/gateway.mjs:407-412` (`redact` only on `error.message`; `src/util.mjs:121-127`)
- **attacker:** H
- **impact:** `UnavailableError` / `ValidationError` `details` can include registry `missing` artifact reasons (filesystem paths, runtime names). Local recon of the layout; not a write primitive.
- **fix:** Redact or drop `details` on the HTTP path; keep them in the process log.

### B22. `allow_peers` CIDR with `/0` (or non-integer prefix) can allow every IPv4 peer

- **file:** `src/gateway.mjs:108-116`
- **attacker:** H, only if an operator (or `addPeers`) installs a wide CIDR — not the default manifests
- **impact:** `bits >= 0 && bits <= 32` allows `0`. Mask becomes `0`, so every IPv4 `remoteAddress` matches. Combined with no API key, that is unauthenticated access from anywhere the socket is reachable. Default configs do not set `allow_peers`.
- **fix:** Reject `bits < 8` (or at least `/0`), require integer prefix length, and still require an API key for any non-loopback bind.

### B23. `runtime.command` / `extra_args` / `runtime.env` trusted after expansion

- **file:** `src/config.mjs:96-97` (only `model|draft_model|projector|system_policy`); `src/process-manager.mjs:301-306`, `:361`
- **attacker:** E (untrusted manifest)
- **impact:** `command` and argv are not confined; `extra_args`/`profile.args` could add `--host 0.0.0.0` and bind backends off loopback. Shipped extra_args are only `--embeddings` / `--pooling last` / `--reranking`. Shipped `base_args` keep `--host 127.0.0.1`.
- **fix:** Resolve+confine `command` like models; allowlist argv flags that may appear after expansion.

### B24. Mailbox/IPC hash fat strings only at the top level; model `reason` sits in an object

- **file:** `src/mailbox.mjs:31-38`; `src/monitor/ipc.mjs:146-154`; `src/gateway.mjs:448-455`
- **attacker:** M (`plan.reason` after `stripControls`, no length cap except consult `NEXUS_MAX_TOKENS`)
- **impact:** Envelope `kind`/`source` stay gateway-chosen. `payload: { reason, hops }` is shallow-copied; the 256-char → sha256 rule does not apply to object fields. Cross-session `/v1/monitor/recent` and the logical snapshot (B3) can echo that text. Not parsed as an IPC verb today.
- **fix:** Cap/hash string fields inside objects (same 256 / sha256 as top-level). Keep `reason` out of hot-ring payload or store a digest only.

### B25. Entropy / gate `denyRespond` does not reject advertised reboot verbs

- **file:** `src/monitor/entropy.mjs:180-185`, `:191-209`; `src/monitor/gate.mjs:80-85`
- **attacker:** P passing `call: 'lockdown'` / `'secure_reboot'` on credit/hash/begin
- **impact:** Entropy ignores the verb and still returns a credit envelope. Gate only `assertCaller`s (throw), and only if `call` is set. Stubs succeed or throw instead of reject.
- **fix:** If a respond verb appears on these APIs, return `{kind:'reject', ok:false}` (same as respond). Do not continue as credit/begin.

### B26. IPC `push` skips `CALL_TABLE`; default mask includes `GRADE`

- **file:** `src/monitor/ipc.mjs:78-79`, `:333-401`; `src/monitor/calls.mjs:36` (`post: EVERYONE`)
- **attacker:** P using `CAP_DEFAULT` (includes `CAP.GRADE`). Gateway mask does **not** include GRADE.
- **impact:** `push()` never calls `callerDeniedReason`. `post()` is allowed for every role. Workers can enqueue `kind:'grade'` without being SAD. Harmless until a drain maps grade → policy.check (B5).
- **fix:** Gate `kind:'grade'` on a SAD/policy role **and** `CAP.GRADE`. Do not put GRADE in the default worker mask. Have `push` use the same caller table as `post`.

---

## Inspected OK (do not re-audit)

- **CORS is not `*`.** `corsHeaders` exact-matches `manifest.gateway.cors_origins`, reflects that origin, sets `vary: origin`, and does not send credentials. Residual is B7 (port-80 list), not a wildcard.
- **Slash `/text` `/code` `/image` `/auto` are chat-body commands, not HTTP paths.** `GET/POST /text` 404. Parser requires the whole unfenced latest user text to match `^/([a-z]+)…$`; unknown tokens return `null`. No extra-path or method confusion into a different slash token.
- **Body size.** `readBody` counts bytes, destroys on overflow, throws `ValidationError`. Default 16 MiB. Non-object JSON rejected. Prototype pollution via `JSON.parse` + spread did not pollute `Object.prototype` on this Node.
- **HTTP cannot invoke monitor verbs.** `EXPLICIT_ROUTES` has no lockdown/reboot. `GET /v1/monitor/recent` and `security-monitor-agent` only **read**. Gateway mask is `CAP.POST | CAP.OBSERVE | CAP.SNAPSHOT`, role `'green-roomz'`.
- **`respond.mjs` matches policy:** 8080/SAD/worker/logger denied; missing cap rejects; uncallable returns reject, never executes; Note9/no `AID_ROOT` rejects `secure_reboot`; `halt(machine)` v1-illegal; `replicaCount = 1`.
- **`MonitorIpc.push`:** missing cap bit → reject; `kind:'vote'` with the bit → uncallable reject; non-allowlisted upcall (`op: 'secure_reboot'`) rejected.
- **HTTP cannot load a manifest or drive expansion.** `loadManifest` is CLI-only. Gateway has no reload/config path. Request JSON is not passed to `expandEnvironment`.
- **Pack launchers pin loopback and ignore extra argv.** `start.sh` / `start.cmd` exec `node ... --host 127.0.0.1 --port 8080` (no `"$@"`). Spawn is `shell: false`. TTS is `execFile` + stdin of **H** text, 4000-char cap, not M.
- **CR/LF header injection on `x-green-roomz-*`:** names are constants; values go through `headerSafe`. Node rejects CR/LF in `setHeader`/`writeHead`. Residual is B18 (LS/PS), not CR/LF.
- **HANDOFF `suggest`:** `^[a-z0-9][a-z0-9-]{0,63}$`, drops `auto` / nexus. Gateway only pushes a note; it does not spawn, grant, or route on `suggest`.
- **Peer spoofing via headers:** `peerAllowed` uses `request.socket.remoteAddress`, not `X-Forwarded-For`. Public bind refuses `0.0.0.0`/`::` without `GREEN_ROOMZ_ALLOW_PUBLIC=1`.
- **Bearer compare:** `secureEquals` is length-checked `timingSafeEqual`. Query-string API keys are not accepted.
- **Shipped Windows + repo cursor manifests** use literal paths (no `${}` collapse). Policy fields are `policies/<KERNEL_BASENAME>`. `validateManifest` rejects secret-shaped keys.

## Monitor dispatch

| Path | Can invoke lockdown/reboot/secure_reboot? | Cap check before dispatch? |
|---|---|---|
| HTTP 8080 | No | N/A (routes don’t expose verbs) |
| `Mailbox.push` | Message accepted (`ok:true`); not executed | **No** |
| `MonitorIpc.push` | Reject (unknown kind or uncallable) | Kind cap for known kinds; lockdown bits unused |
| `MonitorIpc.lockdown()` etc. | Throw, not reject | **No** |
| `createRespond().lockdown()` | Reject envelope | Role + cap + uncallable |
| `createNetwork().lockdown('machine')` | Throw | Only if mask set; no role |
| `createPolicy().check(grade stop/wipe)` | `ok:true` + `verb` advertised | Only if cap list set |
| `createIsolate().lockdown()` | Throw | **No** (except Note9 `secure_reboot` via apply) |

## API-first fix order

1. HTTP: default-on auth, require JSON content-type, empty CORS, per-token session identity, always prepend stock prompt, drop `endsWith('/route')`.
2. Model: reject MONITOR / logical from nexus accept; strip LS/PS; allowlist downstream headers so 8080 stamps win.
3. Monitor: reject envelopes everywhere for uncallable reboot-class; default-deny bits; don’t return verbs from grades; bind role/mask to the instance; don’t commit state on reject-stubs; don’t dual-write an ungated mailbox.
4. Config: allowlist `${}` keys, confine resolved paths, redact expanded paths on HTTP, pin pack asset digests.

Gap: no unit tests for `expandEnvironment` / `resolveManifestPath` (`test/config.test.mjs` covers alias roster, secret field names, projector ban).

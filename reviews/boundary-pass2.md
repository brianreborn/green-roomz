# Green-Roomz boundary review — second pass

Date: 2026-09-03. Tree: `/workspace/green-roomz`. Live gateway: `127.0.0.1:8080` node pid 1849424 (pack `/workspace/e2e-fresh/green-roomz`, `GRZ_ROOT` set, `GREEN_ROOMZ_API_KEY` unset). First board: `/workspace/reviews/boundary-review.md`. No tree patches. No exploit steps.

Scope stays trust boundaries / validation / capability abuse. Race/liveness and covert timing/stego are cited only where they change a boundary claim.

## Method

- Re-read `race-review.md`, `covert-review.md`, `covert-fixes.md`, `fuzz-review.md`.
- Re-read the cited first-pass sites in `src/`.
- Observational live GETs/OPTIONS only (`/health`, `/v1/models`, `/v1/monitor/recent`, `/metrics`, CORS preflight). Did not POST inference, slash, or reboot-class. Fuzz already exercised those; outcomes are cited, not reproduced.

## Live 8080 (observational)

| Check | Result | First-pass id |
|---|---|---|
| Auth | GET `/v1/models` 200, no `WWW-Authenticate`. Process env has `GRZ_ROOT` / empty `GRZ_EXE`, no `GREEN_ROOMZ_API_KEY`. | B1 |
| CORS | `OPTIONS` + `Origin: http://localhost` → `access-control-allow-origin: http://localhost`. `Origin: http://evil.example` → no ACAO. Not `*`. No credentials. | B7 |
| Monitor dump | `GET /v1/monitor/recent` 200. Three `success` events; `ticket` is a UUID (other clients’ sessions). | B8, B3 |
| Health paths | `unavailable_reasons` include absolute pack paths (`model:/workspace/e2e-fresh/green-roomz/models/missing-vision.gguf`, runtime missing-whisper/piper/sd). `security-monitor-agent` `runtime` logical, `availability: ready`. Mailbox `pushed: 3`. | B16 |
| Reboot HTTP | Fuzz h017–h040: GET/POST `/lockdown` `/reboot` `/secure_reboot` `/text` `/code` `/auto` all 404. | first-pass OK |
| Slash reboot | Fuzz c028/c029: slash `/reboot` `/lockdown` in chat JSON → route-plan 200, not HTTP verbs. | first-pass OK |
| Missing Content-Type | Fuzz c019 POST `/v1/chat/completions` missing CT → 200. | B2 |
| `messages=number` | Fuzz c006 POST `/v1/chat/completions/route` → 500 `internal_error` (not iterable). | **new B27** |
| In-proc uncallable | Fuzz: `ipc.lockdown` throw `complex-last`; `respond.lockdown` reject; `Mailbox.push` kind lockdown `ok:true`. | B4, B12 |

## Cross-board map

| Other id | Relation to boundary | Action |
|---|---|---|
| Fuzz HTTP 404s on reboot/slash paths | Confirms 8080 does not expose reboot-class or slash-as-path | Keep OK |
| Fuzz p001–p019 throw vs reject | Confirms B4; see nuance below on network | Keep B4; annotate |
| Fuzz m002–m004 mailbox any-kind `ok:true` | Confirms B12 | Keep |
| Fuzz e001 empty `${}` | Confirms B14 | Keep |
| Fuzz c006 500 | Unguarded `body.messages` iteration | **Add B27** |
| Fuzz GET-family ignore method | Read-only routes skip POST check (`gateway.mjs:356-385`). Not a write bypass. | Note only |
| RACE-G1 dual-post mailbox vs IPC | Same dual-write as B12; they want IPC as source of truth | Same fix; do not fork a second ring design |
| RACE SAFE “stubs throw or reject; 8080 never imports reboot” | Agrees HTTP cannot raise; disagrees that throw counts as policy reject | Our B4 wins on envelope shape |
| LIVE-LOG1 logger `{ok:true}` on missing sink | Adjacent to B13 (role rewrite / missing-role read). Fail-open audit. | Mention in B13 fix; do not steal race occupancy work |
| LIVE-ENT1 entropy missing-cap no-op | Same class as B25 | Keep B25 |
| CC-5 / CC-6 mailbox HTTP dump + tickets | Same surface as B3 + B8 | Keep; covert-fixes F2 hashes payloads — compatible |
| CC-9 / covert-fixes §3 `cache_prompt` passthrough | Client JSON field forwarded to llama slot. Trust boundary we missed. | **Add B28** |
| CC-14 route headers | We treated as OK given `headerSafe`. Residual B18 LS/PS + B19 writeHead clobber | Keep B18/B19. Covert-fixes F4 strip set includes U+2028/U+2029 — **share that change**, do not duplicate a second stripper |
| CC-18 error details | B21 | Keep |
| CC-19 nested payload unhashed | B24 | Align with covert-fixes F2 (always hash) |
| Covert-fixes timing pad / CPU pins / poll / media-scan | Out of boundary scope | Do not fork |

## First-pass corrections / nuance

### B2 Content-Type — still high, narrowed

Live/fuzz: `text/plain`, `form-urlencoded`, `multipart` on `/route` returned **400** (body is not JSON). The hole is **JSON with a simple or missing Content-Type** (fuzz c019 200), not “any body type is accepted”. CSRF still works for `application/json` missing CT, or a browser `fetch` that sends JSON as `text/plain` only if the body still `JSON.parse`s — typical `text/plain` bodies do not. Keep the require-`application/json` fix; impact is confused-deputy **when the body is JSON**, plus native/non-browser clients.

### B4 network lockdown — throw vs fuzz 403

`createNetwork().lockdown` is `apply('lockdown', target)`.

- Default / `'machine'` hits `UNCALLABLE` and **throws** `complex-last` (`network.mjs:238-241`).
- ifX / `eth0` hits `MACHINE_ONLY` first and **rejects** “lockdown is machine-only” (`:222-225`).

Fuzz 403 on `network.lockdown` is the ifX reject, not a reboot-class reject envelope. Machine path still throws. Policy unchanged: uncallable reboot-class must `{kind:'reject', ok:false}` for every target. `respond.uncallable()` (`respond.mjs:326-341`) remains the template.

### B7 CORS — not `*`

Confirmed live. Residual is the shipped port-80 list (`http://localhost`, `http://127.0.0.1` without port) in all four manifests.

**OPTIONS is not peer-gated.** `gateway.mjs:341-344` answers CORS 204 **before** `peerAllowed`. A matching Origin can get ACAO without a peer check. Combined with B1 (no API key) a port-80 page can read JSON. `authorization` is in allow-headers; credentials flag is off.

### B20 `/route` suffix + chat-path suffix

`wantsRoutePlan` still `endsWith('/route')`. Also `isChatPath` (`gateway.mjs:198-201`) treats any path ending `/chat/completions` after stripping `/route`. Extra segments still 404 unless they end in `/route` (because of `EXPLICIT_ROUTES`). Keep B20; allowlist exact paths only.

## New findings

### B27. `body.messages` is iterated without an array check → 500

- **severity:** medium
- **file:** `src/routing.mjs:24-29` (`detectModalities`); also `:52` `audioDataFromBody`, `:64` `isExplicitTranslationRequest` `.flatMap`; `src/logical-router.mjs:5` `collectText`. Callers: `hardRuleRoute` (`routing.mjs:336`) from `handleRoutePlan` (`gateway.mjs:836`) **and** `handleChatTurn` (`:946`), plus `handleDirectAlias` / council (`:918`, `:618`).
- **attacker:** H
- **impact:** `?? []` does not help: a number is non-nullish, so `for...of` throws. Gateway maps that to 500. Confirmed fuzz c006. **Correction:** `latestUserMessageText` uses an index loop (`:43-48`) and does **not** throw on a number. A **string** `messages` is iterable (character walk) and does not 500; object/boolean do. Same hole on `/v1/chat/completions`, not only `/route`.
- **fix:** If `messages` is present and not an array, `throw new ValidationError('messages must be an array')` at the HTTP boundary before routing. Guard every `for...of`. Do not catch-all TypeError as 500.

### B28. Client JSON fields (including `cache_prompt`) are forwarded to llama-server

- **severity:** medium
- **file:** `src/gateway.mjs:176-191`
- **attacker:** H
- **impact:** `prepareInferenceBody` spreads the client body, deletes only `route_plan_only` / `lock_alias` / `session_id`, then sends it upstream. `cache_prompt`, slot ids, and other llama.cpp fields pass through onto `--parallel 1` slot 0 (Covert CC-9). Combined with B1/B8 (shared identity) this is a cross-client KV/capability leak, not just a covert timing channel.
- **fix:** Allowlist upstream JSON keys. Force `cache_prompt: false` on live hops. Same as covert-fixes §3; do not invent a second stripping site. Prime on the agent port may keep `cache_prompt: true`.


### B29. `sessions.patch` `Object.assign` has no field allowlist

- **severity:** medium (in-process); low from HTTP slash path today
- **file:** `src/sessions.mjs:39-46`
- **attacker:** P with the Gateway `sessions` object. HTTP `applyTurnSettings` currently passes only slash-derived keys (`faith`/`fear`/`confidenceMood`/`yolo`/`councilDefault`/`op`/`rebuke`).
- **impact:** `Object.assign(entry, fields)` can overwrite `identity`, `id`, `expiresAt`. Any future caller that forwards client JSON into `patch` becomes a session takeover. No identity check on `patch` itself (`get` checks identity; `patch` does not).
- **fix:** Allowlist patch keys. Never assign `id` / `identity` / `expiresAt` / `createdAt` from `fields`. `patch` should `get`-style identity-match or be private to the ledger.

## Still holds (not re-opened)

B1 unauthenticated loopback operator. B3 nexus MONITOR accept-list + logical mailbox dump. B5 grade advertises reboot verbs. B6 bits advertised but not gating when mask omitted. B8 shared identity + ticket leak (live tickets seen). B9 24-char kernel skip (`injectSystemPolicy` still `policy.trim().slice(0, 24)` + `includes`). B10 caller-claimed role/mask; `CALL_TABLE` lockdown callers are `respond` only (`calls.mjs:59-61`) but `network.apply` never `assertCaller`. B11 NIC stub commits then rejects. B13 SAD→monitor emit rewrite. B14–B17 config/pack. B18 LS/PS. B19 proxy `writeHead` clobbers stamps. B21–B26 as written.

`GATEWAY_IPC_RIGHTS` still `POST|OBSERVE|SNAPSHOT`. `replicaCount` still defaults to 1. No frozen `REPLICAS=3`.

## Do not steal

- Race: PolicyGate deadlock, health/PID, in-flight refcount, GGML thread cap, success-before-body. Mention G1 only as the dual-post of B12.
- Covert-fixes: timing quantization, CPU affinity, `--poll 0`, media-scan. Share F2 hash, F3 cache_prompt, F4 U+2028/U+2029 strip.

## API-first order (for the fix pack)

1. HTTP principal + JSON content-type + empty CORS + per-token sessions (B1, B2, B7, B8).
2. Validate `messages` as array (B27); always prepend kernel (B9); exact `/v1/chat/completions/route` (B20); allowlist upstream JSON (B28).
3. Nexus reject MONITOR/logical (B3); strip LS/PS in `stripControls` (B18, share F4); allowlist downstream headers (B19).
4. Monitor: reject envelopes for reboot-class (B4); default-deny bits (B6); no verb on grades (B5); bind role/mask to instance (B10); reject before `setState` (B11); gate Mailbox.push (B12); logger default-deny (B13).
5. Config: allowlist `${}`, confine paths, redact HTTP missing-reasons, pin pack digests (B14–B17).

## Recheck log (source confirm)

All first-pass numbered claims re-read in tree: B1–B6, B8–B16, B18–B20, B27–B28 **CONFIRMED**. Network throw vs fuzz 403 remains machine vs ifX. `KIND_CAP` has no lockdown; `ipc.push({kind:'lockdown'})` rejects `"unknown kind"` before `STUB_KIND_REASON`; `MonitorIpc.lockdown()` still throws. Git tree has **no** `start.sh`; key is unset in `scripts/start-green-roomz.ps1`, `scripts/cursor-serve.sh`, `scripts/note9-restart-serve.sh`, `scripts/serve-window.cmd`. `this.apiKey = process.env.GREEN_ROOMZ_API_KEY || ''` (`gateway.mjs:290`).


## Sibling pass2 (race / covert) — 2026-09-03 ~04:41 PT

Read `/workspace/reviews/race-pass2.md`, `race-fixes.md`, `covert-pass2.md`. No cite drift vs our board. Do not fork their RF/F numbers.

| Sibling | Ours | Compose |
|---|---|---|
| Race G1 / RF6 / RF7 | B12 | One publish; mailbox kind allowlist. They own drain snapshot; we own reboot-class reject. |
| Race stubs SAFE | B4 | 8080 cannot call. Throw-not-reject stays ours. |
| Race LIVE-H2 method-agnostic dumps | B1 | Add GET-only on `/health` `/props` `/metrics` `/v1/models` `/v1/monitor/recent`. OPTIONS after peer-gate. |
| Covert CC-P2-5 | B3/B8 | F11 “session-local or gone” — same as F-B3/F-B8. |
| Covert CC-P2-1 `/slots` on :8187 | — | Loopback llama, not 8080. Leave to covert F14. Mention only: our B23 `--host 0.0.0.0` would expose it off-box. |
| Covert CC-P2-8 / P2-6 / P2-7 / P2-11 | B16 / B18 / B19 / B7 | Already in our pack. |
| Fuzz 500 messages=number | B27 | They leave it to us. |

**Platform Reviewer** board `/workspace/reviews/platform-review.md` was **missing** at 04:41 PT. Do not invent OS/path/signal findings ahead of it. Fold when it exists (paths, MAX_PATH, signals, spawn stdio, bind). Same joint-submit rule.

# P0 security integrate — apply notes

Date: 2026-09-03 ~05:00 PT. Operator cut on `/workspace/green-roomz`. **Security P0 table only** (`reviews/integrate-refinement.md`). Did **not** expand into platform PF1–PF9 / PLAT-*. Live serve left up. No git commit/push. No `src/` copy onto the live 8080 process.

## Bindings kept

- RF1 settle-once, then RF2 hop refcount, then RF3 thread budget.
- F1 `holdMs` after PolicyGate `release()`.
- F13 restore only when `refs=0` and slot idle (`is_processing` not true).
- F22 logger drop `{ok:false, dropped:true}`.
- Cursor nexus `--threads` stays **4**; empty CPU set = no spawn; timed-out cpu-4 does not retry cpu-6.
- `messages` not array → 400 `validation_error`. Mailbox lockdown/reboot/vote → `ok:false`.
- GET-family POST/PUT/DELETE → 405. Mutating POST needs `Content-Type: application/json`.
- CORS default `[]`; OPTIONS denied peer 403; no `*`.
- Hashed tickets on `/v1/monitor/recent`; `sessions.patch` allowlist.
- Stream `timings` stripped; U+2028/U+2029 in strip controls; no homoglyph decoder.
- `--no-webui`; never `--metrics`; `extra_args` cannot bind `0.0.0.0`; `/slots` not proxied.
- Uncallable lockdown/reboot: HTTP 404; in-process reject envelope; 8080 never owns reboot.
- Loopback remains the trust boundary (F-B1 API-key product is P2).

## Files changed (this cut)

New:

- `src/cpu-set.mjs`
- `src/timing-quant.mjs`
- `test/cpu-set.test.mjs`
- `test/timing-quant.test.mjs`
- `test/util-strip.test.mjs`

Patched sources:

- `src/scheduler.mjs` — RF1 settle-once
- `src/process-manager.mjs` — RF2 pin/refcount, RF3 allocator, F13 restore, F14 argv, resume `/health`
- `src/gateway.mjs` — HTTP shape, CORS/OPTIONS peer, messages array, hashed tickets, pin around hops, `holdMs` after release, peek 4xx not success, mailbox seq stays numeric
- `src/proxy.mjs` — sanitized SSE (no raw pipeline), return `{status}` so 5xx is not a success hop
- `src/mailbox.mjs` — hop kind allowlist + drain snapshot
- `src/sessions.mjs` — patch allowlist
- `src/util.mjs` — LS/PS
- `src/routing.mjs`, `src/logical-router.mjs` — messages array-safe
- `src/handoff.mjs` — LS/PS via util
- `src/monitor/{logger,api,ipc,isolate,network}.mjs` — drop envelope / uncallable reject

Configs (cors empty; Cursor nexus threads remain 4):

- `config/agents.cursor.json`
- `config/agents.windows.json`
- `config/agents.android.json`
- `config/agents.note9.json`

Tests extended:

- `test/gateway.test.mjs`, `test/process-manager.test.mjs`, `test/proxy.test.mjs`
- `test/scheduler.test.mjs`, `test/mailbox.test.mjs`, `test/sessions.test.mjs`
- `test/monitor-{logger,api,ipc,isolate,network}.test.mjs`

## Tests run (`node --test`, not live e2e)

From `/workspace/green-roomz`:

```
test/scheduler.test.mjs
test/cpu-set.test.mjs
test/timing-quant.test.mjs
test/util-strip.test.mjs
test/mailbox.test.mjs
test/sessions.test.mjs
test/monitor-logger.test.mjs
test/monitor-api.test.mjs
test/monitor-ipc.test.mjs
test/monitor-isolate.test.mjs
test/monitor-network.test.mjs
test/proxy.test.mjs
test/process-manager.test.mjs
test/gateway.test.mjs
```

**147 pass, 0 fail.**

Also `test/fuzz-stress.test.mjs` + `test/config.test.mjs`: **12 pass, 0 fail.**

Did not run full live e2e against 8080. Did not copy patched `src/` over the running serve.

## Live ports after tests (PT)

- `127.0.0.1:8080` node — still listening
- `127.0.0.1:8187` llama-server — still listening
- `:8184` was not listening before or after (not stopped by this cut)

## Not this cut

- Platform PF1–PF9 / PLAT-* (pack is on disk for a follow-on).
- P1/P2: API keys, `cache_prompt` allowlist, media-scan, `padFrame`, `--poll 0` injection, F-B9 stock prompt, exact `/route` path, etc.
- Git commit/push.

Pre-existing dirty (untouched by this apply besides staying unstaged): `docs/fleet-targets.md`, `docs/stock-prompts.md`, `policies/frames/memory-feedback-loop.md`, `test/compile-prompt.test.mjs`.

# Green-Roomz fuzz review (PASS 2, live local gateway)

- timestamp_utc: 2026-09-03T11:46:17Z
- timestamp_pt: 2026-09-03 04:46 AM PT
- target: http://127.0.0.1:8080
- gateway_pid: 1849424 (unchanged before/after; still listening)
- llama-server: start pid 1849480 → end pid 1903795 on 127.0.0.1:8187 (gateway did not die; llama respawned during real chat)
- health: GET /health 200 degraded before and after
- src: `/workspace/green-roomz/src` identical to `/workspace/e2e-fresh/green-roomz/src` (`diff -q` empty). Citations use `/workspace/green-roomz`.
- scope: 127.0.0.1 only; no WAN; no git push; no reboot; no tree patches; outcomes only
- first pass: `/workspace/reviews/fuzz-review.md`

## Summary counts (HTTP)

main_run total=75  2xx=38  4xx=32  5xx=4  hangs>30s=0  crashes=0  conn_errors=0
follow-up HTTP rows=9 (500 message text, monitor field names, TE retry, stream timings reconfirm)
inproc_cases=35

Pass 2 HTTP ≥40 including reconfirms + new. Two budgeted real llama chats (c050, c052). One extra 1-token stream (c052b) used only to re-read timings after truncation.

## Hangs >30s / crashes

- none >30s. Gateway node pid 1849424 still on :8080.
- r002 TE-chunked first attempt: client abort at 15s (timeout). Retry r002b → 200 6ms. Not a 30s hang.
- HEAD this pass: Node HTTP 200 1ms; `curl -I` 200 1.5ms (pass 1 saw ~6s curl-18 wait on Content-Length). Delay not reproduced on HEAD this pass.
- llama pid changed 1849480→1903795 during c050 (~9.3s). Gateway unchanged.

## 500s (HTTP)

All TypeError via `detectModalities` `for...of` on non-iterable `messages` (also `latestUserMessageText` / `.flatMap`). Uncaught → `gateway.mjs:402-412` `internal_error`.

- c001 messages=42 → 500 3ms — "number 42 is not iterable"
- c002 messages=true → 500 2ms — "boolean true is not iterable"
- c003 messages={} → 500 1ms — "object is not iterable"
- c004 messages=1.5 → 500 1ms — "number 1.5 is not iterable"

c005 messages="hi" → 200 885ms (string is iterable; iterates characters). FINDING vs expected 400.

## lockdown/reboot HTTP

All still 404 `not_found`: GET/POST `/lockdown` `/reboot` `/secure_reboot` `/v1/lockdown` `/v1/reboot` `/text` `/code` `/auto` `/admin` `/shutdown` `/monitor` `/v1/monitor`. Not a finding.

## Reconfirmed vs new

**Reconfirmed (pass 1 still true)**

- Fuzz-1 500 on messages=number; same for true / {} / 1.5 (new siblings, same root)
- Fuzz-2 messages=string → 200 char-iteration
- GET-family ignores method: POST/PUT/PATCH /health /v1/health, DELETE/POST /v1/models, PUT /metrics still 200. OPTIONS 204. GET /v1/chat/completions still 405.
- Missing Content-Type parses JSON (B2). form-urlencoded / text-plain / multipart **without** JSON → 400. **text/plain + valid JSON → 200** (content-type never inspected).
- Mailbox.push lockdown/reboot/vote → ok:true. MonitorIpc.push same kinds → reject ok:false.
- ipc.lockdown/reboot/secure_reboot, isolate.lockdown/reboot, network.lockdown/reboot, api.vote/secureReboot throw `complex-last`. respond.* → `{kind:'reject', ok:false, executed:false}`.
- expandEnvironment missing key → empty string; nested `${${FOO}}` → `${alpha}`; compile-prompt does not expand `${}`.
- 2MB /route accepted (290ms). slash /text /code /auto → 200. max_tokens=-1 → 200.
- HTTP lockdown/reboot still 404.

**New / extended**

- messages missing / `[]` / null → 200 (nexus consult ~640–660ms). content object/number → 200 (skipped by `!Array.isArray(content)`).
- Origin `http://localhost` and `http://127.0.0.1` reflected as ACAO on GET `/v1/monitor/recent`, POST `/route`, OPTIONS `/v1/chat/completions` (B7).
- After real chat, GET `/v1/monitor/recent` fields: `object,data,stats,ipc`; event `seq,kind,source,ticket,ts,payload,target`; payload `reason,hops` (CC-5/B8). No secret values dumped here.
- POST `/route` model=`security-monitor-agent` → 200 **route plan** `{route, reason_code}` (not a mailbox dump).
- POST `/v1/chat/completions` model=`security-monitor-agent` → 200 logical snapshot; content keys `alias,runtime,mailbox,stats`; mailbox[0] `seq,kind,source,ticket,ts,payload,target`; runtime=`logical` (CC-5/B3).
- system `# Green-Roomz agent` on /route → 200 accepted (B9; not proving kernel skip).
- stream:true max_tokens=1 → 200 SSE ~790–794 bytes; **no `timings` / `prompt_n` / `predicted_n`** on this tiny stream (CC-1 not observed here).
- cache_prompt:true + extra llama fields on /route → 200 (CC-9; plan path still accepts).
- 32k header → 400. duplicate Content-Length → 400.
- embeddings/rerank messages-like junk → 400 validation_error.
- unicode ZWSP in user content /route → 200.
- policy grade stop → `verb:'lockdown'` ok:true inert; wipe → `verb:'secure_reboot'` (B5).
- network freeze/reset/halt on nic: state mutates (up→frozen/resetting/halt) then reject (B11). In-memory stub only.
- ipc.lockdown without CAP.LOCKDOWN still throws complex-last (B6).
- logger: `callerRole:'sad'` emit succeeds (remap to monitor); `read()` with omitted role returns chain (B13).
- Mailbox.drain listener that push()es: 50001 iterations in 64ms; livelock until cap (RACE-M1). No leftover interval.
- expandEnvironment `${constructor}` → `"function Object() { [native code] }"`; empty GRZ_ROOT → `/runtime/llama-server` (B14).
- omitted rightsMask: isolate.map and network.down default-allow ok:true; rightsMask=0 rejects missing capability.

## CORS / monitor-dump / content-type

- CORS is not `*`; reflects allowlisted `http://localhost` / `http://127.0.0.1` (no port) + `allow-methods: GET, POST, OPTIONS`. B7.
- Monitor dump includes `ticket` + `ts` + `hops` on both `/v1/monitor/recent` and monitor-alias chat. Field names only.
- Content-Type: JSON parsed for missing / empty / text/plain / text/html. Non-JSON bodies 400. Require `application/json` (B2).

## HTTP cases (method/path/mutation → status, time_ms)

- h001 GET /health [baseline] → 200 8ms
- c001 POST /v1/chat/completions/route [messages=number] → 500 3ms FINDING
- c002 POST /v1/chat/completions/route [messages=true] → 500 2ms FINDING
- c003 POST /v1/chat/completions/route [messages={}] → 500 1ms FINDING
- c004 POST /v1/chat/completions/route [messages=1.5] → 500 1ms FINDING
- c005 POST /v1/chat/completions/route [messages=string] → 200 885ms FINDING char-iteration
- c006 POST /v1/chat/completions/route [messages=null] → 200 656ms
- c007 POST /v1/chat/completions/route [messages-missing] → 200 660ms
- c008 POST /v1/chat/completions/route [messages=[]] → 200 639ms
- c009 POST /v1/chat/completions/route [content-object] → 200 669ms
- c010 POST /v1/chat/completions/route [content-number] → 200 647ms
- h010 GET /lockdown [must-404-GET] → 404 1ms
- h011 POST /lockdown [must-404-POST] → 404 1ms
- h012 GET /reboot [must-404-GET] → 404 1ms
- h013 POST /reboot [must-404-POST] → 404 1ms
- h014 GET /secure_reboot [must-404-GET] → 404 1ms
- h015 POST /secure_reboot [must-404-POST] → 404 1ms
- h016 GET /v1/lockdown [must-404-GET] → 404 1ms
- h017 POST /v1/lockdown [must-404-POST] → 404 0ms
- h018 GET /v1/reboot [must-404-GET] → 404 0ms
- h019 POST /v1/reboot [must-404-POST] → 404 1ms
- h020 GET /text [must-404-GET] → 404 1ms
- h021 POST /text [must-404-POST] → 404 1ms
- h022 GET /code [must-404-GET] → 404 0ms
- h023 POST /code [must-404-POST] → 404 1ms
- h024 GET /auto [must-404-GET] → 404 1ms
- h025 POST /auto [must-404-POST] → 404 1ms
- h026 GET /admin [must-404-GET] → 404 1ms
- h027 POST /admin [must-404-POST] → 404 0ms
- h028 GET /shutdown [must-404-GET] → 404 0ms
- h029 POST /shutdown [must-404-POST] → 404 0ms
- h030 GET /monitor [must-404-GET] → 404 0ms
- h031 POST /monitor [must-404-POST] → 404 1ms
- h032 GET /v1/monitor [must-404-GET] → 404 1ms
- h033 POST /v1/monitor [must-404-POST] → 404 1ms
- h040 POST /health [POST-on-GET-route] → 200 1ms FINDING
- h041 PUT /health [PUT-on-GET-route] → 200 1ms FINDING
- h042 DELETE /v1/models [DELETE-on-models] → 200 1ms FINDING
- h043 PATCH /v1/health [PATCH-on-health] → 200 1ms FINDING
- h044 POST /v1/models [POST-on-models] → 200 1ms FINDING
- h045 PUT /metrics [PUT-on-metrics] → 200 1ms FINDING
- h046 OPTIONS /health [OPTIONS] → 204 0ms
- h047 GET /v1/chat/completions [GET-on-POST-route] → 405 0ms
- c020 POST /v1/chat/completions/route [missing-content-type] → 200 669ms FINDING B2
- c021 POST /v1/chat/completions/route [form-urlencoded-no-json] → 400 1ms
- c022 POST /v1/chat/completions/route [text-plain-no-json] → 400 3ms
- c023 POST /v1/chat/completions/route [multipart-no-json] → 400 1ms
- c024 POST /v1/chat/completions/route [text-plain-valid-json] → 200 708ms FINDING B2
- c025 POST /v1/chat/completions/route [content-type-application-json] → 200 660ms
- c026 POST /v1/chat/completions/route [content-type-text-html-valid-json] → 200 673ms FINDING
- c027 POST /v1/chat/completions/route [content-type-empty-header-valid-json] → 200 668ms FINDING
- c030 POST /v1/chat/completions/route [slash-text] → 200 2ms
- c031 POST /v1/chat/completions/route [slash-code] → 200 1ms
- c032 POST /v1/chat/completions/route [slash-auto] → 200 723ms
- c033 POST /v1/chat/completions/route [cache_prompt-true-extra-llama] → 200 683ms CC-9
- c034 POST /v1/chat/completions/route [unicode-zwsp] → 200 742ms
- c035 POST /v1/chat/completions/route [max_tokens=-1] → 200 765ms
- c036 POST /v1/chat/completions/route [system-green-roomz-agent-prefix] → 200 696ms B9 accepted
- c037 POST /v1/chat/completions/route [model-security-monitor-agent] → 200 1ms plan {route,reason_code} not dump
- c038 POST /v1/embeddings [messages-like-junk] → 400 1ms
- c039 POST /v1/rerank [messages-like-junk] → 400 1ms
- c040 GET /v1/monitor/recent [origin-localhost] → 200 1ms ACAO=http://localhost B7
- c041 GET /v1/monitor/recent [origin-127.0.0.1] → 200 1ms ACAO=http://127.0.0.1 B7
- c042 POST /v1/chat/completions/route [origin-localhost] → 200 724ms ACAO=http://localhost
- c043 POST /v1/chat/completions/route [origin-127.0.0.1] → 200 715ms ACAO=http://127.0.0.1
- c044 OPTIONS /v1/chat/completions [cors-preflight-localhost] → 204 1ms ACAO=http://localhost methods=GET, POST, OPTIONS
- c045 GET /health [oversized-header-32k] → 400 1ms
- c046 POST /v1/chat/completions/route [2MB-content] → 200 290ms
- c047 POST /v1/chat/completions/route [duplicate-content-length] → 400 2ms
- r001 HEAD /health [HEAD] → 200 1ms (pass 1 ~6s not reproduced on Node HEAD)
- r002 GET /health [TE-chunked-no-chunks] → timeout 15002ms client abort; retry 200 6ms
- c050 POST /v1/chat/completions [real-chat-resident-max1] → 200 9344ms timings=false keys=id,object,created,model,choices,usage
- c051 GET /v1/monitor/recent [after-real-chat] → 200 1ms (full parse: ticket,ts,hops present)
- c052 POST /v1/chat/completions [stream-true-max1] → 200 1918ms sse=true timings=false
- c053 POST /v1/chat/completions [model-security-monitor-agent-chat] → 200 1ms mailbox dump shape (see c053b)

## In-process cases

- m001 mailbox [kind-lockdown] → 200 ok:true FINDING B12
- m002 mailbox [kind-reboot] → 200 ok:true FINDING
- m003 mailbox [kind-vote] → 200 ok:true FINDING
- m004 monitor/ipc [push-kind-lockdown] → 403 reject
- m005 monitor/ipc [push-kind-reboot] → 403 reject
- m006 monitor/ipc [push-kind-hop] → 200 ok (expected)
- p001 monitor/ipc [lockdown no CAP.LOCKDOWN] → throw complex-last FINDING B4/B6
- p002 monitor/ipc [reboot] → throw complex-last FINDING
- p003 monitor/ipc [secure_reboot] → throw complex-last FINDING
- p010 monitor/respond [lockdown] → reject ok:false executed:false
- p011 monitor/respond [reboot] → reject
- p012 monitor/respond [secure_reboot] → reject
- p020 monitor/isolate [lockdown] → throw complex-last FINDING
- p021 monitor/isolate [reboot] → throw complex-last FINDING
- p022 monitor/isolate [omitted-rightsMask-map] → ok:true default-allow FINDING B6
- p023 monitor/isolate [rightsMask=0 map] → reject missing capability
- p030 monitor/network [lockdown] → throw complex-last FINDING
- p031 monitor/network [reboot] → throw complex-last FINDING
- p032 monitor/network [freeze eth0] → reject after up→frozen FINDING B11
- p033 monitor/network [reset eth0] → reject after up→resetting FINDING B11
- p034 monitor/network [halt eth0] → reject after up→halt FINDING B11
- p035 monitor/network [omitted-rightsMask-down] → ok:true state=down FINDING B6
- p036 monitor/network [rightsMask=0 down] → reject missing capability
- p040 monitor/policy [grade-stop] → ok:true verb=lockdown inert FINDING B5
- p041 monitor/policy [grade-wipe] → ok:true verb=secure_reboot inert FINDING B5
- p050 monitor/logger [emitRole sad] → ok:true remapped FINDING B13
- p051 monitor/logger [read omitted callerRole] → dumps chain FINDING B13
- p060 mailbox [drain-reentry-push] → livelock 50001/64ms capped FINDING RACE-M1
- e001 expandEnvironment [missing-key] → "pre--post"
- e002 expandEnvironment [nested] → "${alpha}"
- e003 expandEnvironment [${constructor}] → "function Object() { [native code] }" FINDING B14
- e004 expandEnvironment [empty GRZ_ROOT] → "/runtime/llama-server" FINDING B14
- e005 compile-prompt [${} in kernel] → left unexpanded
- p070 monitor/api [vote] → throw complex-last FINDING
- p071 monitor/api [secureReboot] → throw complex-last FINDING

## Notes

- Most chat used POST `/v1/chat/completions/route`. Real llama: c050 max_tokens=1 (9.3s), c052 stream max_tokens=1 (1.9s). Logical monitor dump is not llama.
- GET `/v1/monitor/recent` 200 is allowed read-only; dump of ticket/ts/hops is still CC-5/B8.
- No WAN. No git push. Machine not rebooted. Tester did not kill the gateway. `/workspace/green-roomz` not patched by this pass.
- Raw JSONL: `/workspace/reviews/_scratch/fuzz-pass2-cases.jsonl`

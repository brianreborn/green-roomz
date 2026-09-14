# Green-Roomz fuzz pass 4 (post-P0 bounce)

- timestamp_pt: 09/06/2026, 05:10:49 AM PT
- timestamp_utc: 2026-09-06T12:10:49Z
- ended_pt: 09/06/2026, 05:10:51 AM PT
- ended_utc: 2026-09-06T12:10:51Z
- spec: `/workspace/reviews/integrate-refinement.md` (bind exactly; do not fork IDs)
- cites: `/workspace/reviews/p0-apply-notes.md`, `/workspace/reviews/p0-bounce-notes.md`, `/workspace/reviews/fuzz-pass3.md`
- target: http://127.0.0.1:8080
- gateway_pid: **1329948** (live bounce; pass3 baseline was **1849424**)
- llama :8187 pid **1329974** (untouched; do not stop)
- observed_gateway_pid_start: 1329948 end: 1329948
- observed_llama8187_pid_start: 1329974 end: 1329974
- health: GET /health 200 before, 200 after
- tree: P0 applied + bounced (e2e-fresh overlay). No further `src/` patch this pass. No git. No WAN. No reboot. Did NOT stop.sh / kill 1329948 / 1329974.
- 8080 never owns reboot. HTTP 404 on /lockdown /reboot is PASS.

## Family

Fuzz-1/2: PASS
Fuzz-3: PASS
Fuzz-4: PASS
Fuzz-5: PASS
Fuzz-6: PASS
F-B7: PASS
F-B8: PASS
RF9: PASS (HEAD 200 fast is intended; TE 400/1ms)

## Counts (P0)

HTTP rows=42 pass=42 fail=0
inproc rows=13
total rows=55 pass=55 fail=0
gateway still up: true (pid 1329948)

## Flipped FAIL→PASS (vs fuzz-pass3)

- Fuzz-1/2 | POST /v1/chat/completions/route messages=42
- Fuzz-1/2 | POST /v1/chat/completions/route messages=true
- Fuzz-1/2 | POST /v1/chat/completions/route messages={}
- Fuzz-1/2 | POST /v1/chat/completions/route messages="hi"
- Fuzz-1/2 | POST /v1/chat/completions messages=42
- Fuzz-1/2 | POST /v1/chat/completions messages=true
- Fuzz-1/2 | POST /v1/chat/completions messages={}
- Fuzz-1/2 | POST /v1/chat/completions messages="hi"
- Fuzz-3 | POST /health
- Fuzz-3 | PUT /health
- Fuzz-3 | DELETE /health
- Fuzz-3 | POST /v1/models
- Fuzz-3 | PUT /v1/models
- Fuzz-3 | DELETE /v1/models
- Fuzz-3 | POST /metrics
- Fuzz-3 | PUT /metrics
- Fuzz-3 | DELETE /metrics
- Fuzz-3 | POST /props
- Fuzz-3 | PUT /props
- Fuzz-3 | DELETE /props
- Fuzz-3 | POST /v1/monitor/recent
- Fuzz-3 | PUT /v1/monitor/recent
- Fuzz-3 | DELETE /v1/monitor/recent
- Fuzz-4 | Mailbox.push kind=lockdown
- Fuzz-4 | Mailbox.push kind=reboot
- Fuzz-4 | Mailbox.push kind=vote
- Fuzz-5 | ipc.lockdown()
- Fuzz-5 | ipc.reboot()
- Fuzz-5 | ipc.secure_reboot()
- Fuzz-5 | isolate.lockdown()
- Fuzz-5 | isolate.reboot()
- Fuzz-5 | network.lockdown()
- Fuzz-5 | network.reboot()
- Fuzz-6 | POST /route missing Content-Type + JSON body
- Fuzz-6 | POST /route text/plain + valid JSON
- Fuzz-6 | POST /route empty Content-Type + JSON body
- F-B7 | GET /v1/monitor/recent Origin http://localhost
- F-B8 | GET /v1/monitor/recent tickets hashed (not UUID-shaped)
- RF9 | TE-chunked GET /health (8s timeout, no chunks)

## Residual close-out

- none. Researcher 2026-09-06: HEAD `/health` → 200 fast (CL=0, no stall) is the intended RF9 constant; do not change to 400. TE-chunked GET already 400/1ms.


## Table

| ID | case | expected | observed | PASS/FAIL |
|---|---|---|---|---|
| Fuzz-1/2 | POST /v1/chat/completions/route messages=42 | 400 validation_error | HTTP 400 validation_error 2ms | PASS |
| Fuzz-1/2 | POST /v1/chat/completions/route messages=true | 400 validation_error | HTTP 400 validation_error 1ms | PASS |
| Fuzz-1/2 | POST /v1/chat/completions/route messages={} | 400 validation_error | HTTP 400 validation_error 1ms | PASS |
| Fuzz-1/2 | POST /v1/chat/completions/route messages="hi" | 400 validation_error | HTTP 400 validation_error 1ms | PASS |
| Fuzz-1/2 | POST /v1/chat/completions messages=42 | 400 validation_error | HTTP 400 validation_error 1ms | PASS |
| Fuzz-1/2 | POST /v1/chat/completions messages=true | 400 validation_error | HTTP 400 validation_error 1ms | PASS |
| Fuzz-1/2 | POST /v1/chat/completions messages={} | 400 validation_error | HTTP 400 validation_error 1ms | PASS |
| Fuzz-1/2 | POST /v1/chat/completions messages="hi" | 400 validation_error | HTTP 400 validation_error 1ms | PASS |
| Fuzz-1/2 | POST /v1/chat/completions/route messages=[] | 200 | HTTP 200 726ms | PASS |
| Fuzz-1/2 | POST /v1/chat/completions/route messages omitted | 200 | HTTP 200 645ms | PASS |
| Fuzz-3 | GET /health | 200 | HTTP 200 1ms | PASS |
| Fuzz-3 | POST /health | 405 | HTTP 405 Method not allowed 1ms | PASS |
| Fuzz-3 | PUT /health | 405 | HTTP 405 Method not allowed 1ms | PASS |
| Fuzz-3 | DELETE /health | 405 | HTTP 405 Method not allowed 1ms | PASS |
| Fuzz-3 | GET /v1/models | 200 | HTTP 200 1ms | PASS |
| Fuzz-3 | POST /v1/models | 405 | HTTP 405 Method not allowed 1ms | PASS |
| Fuzz-3 | PUT /v1/models | 405 | HTTP 405 Method not allowed 2ms | PASS |
| Fuzz-3 | DELETE /v1/models | 405 | HTTP 405 Method not allowed 1ms | PASS |
| Fuzz-3 | GET /metrics | 200 | HTTP 200 1ms | PASS |
| Fuzz-3 | POST /metrics | 405 | HTTP 405 Method not allowed 1ms | PASS |
| Fuzz-3 | PUT /metrics | 405 | HTTP 405 Method not allowed 1ms | PASS |
| Fuzz-3 | DELETE /metrics | 405 | HTTP 405 Method not allowed 1ms | PASS |
| Fuzz-3 | GET /props | 200 | HTTP 200 1ms | PASS |
| Fuzz-3 | POST /props | 405 | HTTP 405 Method not allowed 1ms | PASS |
| Fuzz-3 | PUT /props | 405 | HTTP 405 Method not allowed 1ms | PASS |
| Fuzz-3 | DELETE /props | 405 | HTTP 405 Method not allowed 1ms | PASS |
| Fuzz-3 | GET /v1/monitor/recent | 200 | HTTP 200 1ms | PASS |
| Fuzz-3 | POST /v1/monitor/recent | 405 | HTTP 405 Method not allowed 0ms | PASS |
| Fuzz-3 | PUT /v1/monitor/recent | 405 | HTTP 405 Method not allowed 1ms | PASS |
| Fuzz-3 | DELETE /v1/monitor/recent | 405 | HTTP 405 Method not allowed 1ms | PASS |
| Fuzz-4 | Mailbox.push kind=lockdown | {ok:false} | ok:false kind:reject executed:false | PASS |
| Fuzz-4 | Mailbox.push kind=reboot | {ok:false} | ok:false kind:reject executed:false | PASS |
| Fuzz-4 | Mailbox.push kind=vote | {ok:false} | ok:false kind:reject executed:false | PASS |
| Fuzz-4 | Mailbox.push kind=hop (control) | {ok:true} | ok:true | PASS |
| Fuzz-5 | ipc.lockdown() | {kind:'reject', ok:false, executed:false} no throw | ok:false kind:reject executed:false lockdown is uncallable (v1) | PASS |
| Fuzz-5 | ipc.reboot() | {kind:'reject', ok:false, executed:false} no throw | ok:false kind:reject executed:false lockdown is uncallable (v1) | PASS |
| Fuzz-5 | ipc.secure_reboot() | {kind:'reject', ok:false, executed:false} no throw | ok:false kind:reject executed:false secure_reboot is uncallable (v1) | PASS |
| Fuzz-5 | respond.lockdown() | {kind:'reject', ok:false, executed:false} no throw | ok:false kind:reject executed:false lockdown is uncallable (v1; respond records votes, never executes) | PASS |
| Fuzz-5 | respond.reboot() | {kind:'reject', ok:false, executed:false} no throw | ok:false kind:reject executed:false reboot is uncallable (v1; respond records votes, never executes) | PASS |
| Fuzz-5 | isolate.lockdown() | {kind:'reject', ok:false, executed:false} no throw | ok:false kind:reject executed:false lockdown is uncallable (v1) | PASS |
| Fuzz-5 | isolate.reboot() | {kind:'reject', ok:false, executed:false} no throw | ok:false kind:reject executed:false reboot is uncallable (v1) | PASS |
| Fuzz-5 | network.lockdown() | {kind:'reject', ok:false, executed:false} no throw | ok:false kind:reject executed:false lockdown is uncallable (v1) | PASS |
| Fuzz-5 | network.reboot() | {kind:'reject', ok:false, executed:false} no throw | ok:false kind:reject executed:false reboot is uncallable (v1) | PASS |
| Fuzz-5 | GET /lockdown | 404 (8080 never owns reboot) | HTTP 404 not_found 1ms | PASS |
| Fuzz-5 | POST /lockdown | 404 (8080 never owns reboot) | HTTP 404 not_found 1ms | PASS |
| Fuzz-5 | GET /reboot | 404 (8080 never owns reboot) | HTTP 404 not_found 1ms | PASS |
| Fuzz-5 | POST /reboot | 404 (8080 never owns reboot) | HTTP 404 not_found 1ms | PASS |
| Fuzz-6 | POST /route missing Content-Type + JSON body | 400 even if body is JSON | HTTP 400 validation_error 2ms | PASS |
| Fuzz-6 | POST /route text/plain + valid JSON | 400 even if body is JSON | HTTP 400 validation_error 1ms | PASS |
| Fuzz-6 | POST /route empty Content-Type + JSON body | 400 even if body is JSON | HTTP 400 validation_error 1ms | PASS |
| Fuzz-6 | POST /route application/json + messages=[] | 200 | HTTP 200 599ms | PASS |
| F-B7 | GET /v1/monitor/recent Origin http://localhost | 200, no ACAO reflect | HTTP 200 1ms | PASS |
| F-B8 | GET /v1/monitor/recent tickets hashed (not UUID-shaped) | 200, ticket not UUID-shaped | HTTP 200 1ms tickets=0 uuid_shaped=0 | PASS |
| RF9 | HEAD /health (8s timeout) | 200 fast, no body wait (RF9 intended) | HTTP 200 1ms | PASS |
| RF9 | TE-chunked GET /health (8s timeout, no chunks) | 400 fast (not ~6s stall) | HTTP 400 1ms | PASS |

## Notes

- Same P0 IDs as pass3 / integrate-refinement (Fuzz-1/2, Fuzz-3, Fuzz-4, Fuzz-5, Fuzz-6, F-B7, F-B8, RF9).
- Fuzz-1/2: non-array `messages` → 400 `validation_error` before llama; `[]` / omitted on /route still 200.
- Fuzz-3: GET-family dumps honor method (POST/PUT/DELETE → 405).
- Fuzz-4: Mailbox kind allowlist; hop control still ok:true.
- Fuzz-5: in-process reject envelope, no throw. HTTP 404 on /lockdown /reboot; **8080 never owns reboot**.
- Fuzz-6: mutating POST without JSON Content-Type is 400 even if the body is JSON.
- F-B7: Origin http://localhost must not reflect ACAO.
- F-B8: GET /v1/monitor/recent 200 OK; tickets not UUID-shaped.
- RF9: HEAD /health fast; TE-chunked GET with 8s timeout prefer 400 fast not ~6s stall (record ms).
- Residual closed: HEAD /health **HTTP 200 in 1ms** is the intended RF9 constant (Researcher). TE-chunked GET **400 in 1ms** (was ~6002ms in pass3).

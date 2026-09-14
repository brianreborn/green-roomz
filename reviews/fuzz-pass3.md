# Green-Roomz fuzz pass 3 (baseline, tree frozen)

- timestamp_pt: 2026-09-03 04:53:04 AM PT
- timestamp_utc: 2026-09-03T11:53:04Z
- ended_pt: 2026-09-03 04:53:35 AM PT
- ended_utc: 2026-09-03T11:53:35Z
- spec: `/workspace/reviews/integrate-refinement.md` (bind exactly; do not fork IDs)
- target: http://127.0.0.1:8080
- gateway_pid: **1849424** start and end (still listening). GET /health 200 before and after.
- llama :8187 pid 1903795 untouched.
- extra llama :8184 (PLAT-S1 leftover): 1904007 before this pass → 1930209 after Fuzz-1/2 string-messages live completion. This pass did not stop :8080/:8187/:8184.
- tree: **frozen**. No `src/` patch. No git. No WAN. No reboot.
- 8080 never owns reboot. HTTP 404 on `/lockdown` `/reboot` is PASS.

P0 not applied yet. Expected failures recorded as FAIL.

## Family

- Fuzz-1/2: **FAIL**
- Fuzz-3: **FAIL**
- Fuzz-4: **FAIL**
- Fuzz-5: **FAIL** (in-process throws). HTTP GET/POST `/lockdown` `/reboot` **PASS** 404.
- Fuzz-6: **FAIL**
- F-B7: **FAIL** (ACAO reflects `http://localhost`)
- F-B8: **FAIL** (UUID-shaped tickets; GET 200 is OK)
- RF9: **FAIL** (HEAD 200 1ms not 400; TE-chunked GET 200 **6002ms** stall)

## Counts (P0 HTTP)

HTTP rows=42 pass=12 fail=30
inproc rows=13
gateway still up: yes (pid 1849424, GET /health 200)

## Table

| ID | case | expected | observed | PASS/FAIL |
|---|---|---|---|---|
| Fuzz-1/2 | POST /v1/chat/completions/route messages=42 | 400 validation_error | HTTP 500 internal_error 3ms | FAIL |
| Fuzz-1/2 | POST /v1/chat/completions/route messages=true | 400 validation_error | HTTP 500 internal_error 2ms | FAIL |
| Fuzz-1/2 | POST /v1/chat/completions/route messages={} | 400 validation_error | HTTP 500 internal_error 1ms | FAIL |
| Fuzz-1/2 | POST /v1/chat/completions/route messages="hi" | 400 validation_error | HTTP 200 907ms | FAIL |
| Fuzz-1/2 | POST /v1/chat/completions messages=42 | 400 validation_error | HTTP 500 internal_error 2ms | FAIL |
| Fuzz-1/2 | POST /v1/chat/completions messages=true | 400 validation_error | HTTP 500 internal_error 1ms | FAIL |
| Fuzz-1/2 | POST /v1/chat/completions messages={} | 400 validation_error | HTTP 500 internal_error 1ms | FAIL |
| Fuzz-1/2 | POST /v1/chat/completions messages="hi" | 400 validation_error | HTTP 200 7622ms | FAIL |
| Fuzz-1/2 | POST /v1/chat/completions/route messages=[] | 200 | HTTP 200 739ms | PASS |
| Fuzz-1/2 | POST /v1/chat/completions/route messages omitted | 200 | HTTP 200 594ms | PASS |
| Fuzz-3 | GET /health | 200 | HTTP 200 1ms | PASS |
| Fuzz-3 | POST /health | 405 | HTTP 200 1ms | FAIL |
| Fuzz-3 | PUT /health | 405 | HTTP 200 1ms | FAIL |
| Fuzz-3 | DELETE /health | 405 | HTTP 200 1ms | FAIL |
| Fuzz-3 | GET /v1/models | 200 | HTTP 200 1ms | PASS |
| Fuzz-3 | POST /v1/models | 405 | HTTP 200 1ms | FAIL |
| Fuzz-3 | PUT /v1/models | 405 | HTTP 200 1ms | FAIL |
| Fuzz-3 | DELETE /v1/models | 405 | HTTP 200 1ms | FAIL |
| Fuzz-3 | GET /metrics | 200 | HTTP 200 1ms | PASS |
| Fuzz-3 | POST /metrics | 405 | HTTP 200 1ms | FAIL |
| Fuzz-3 | PUT /metrics | 405 | HTTP 200 1ms | FAIL |
| Fuzz-3 | DELETE /metrics | 405 | HTTP 200 1ms | FAIL |
| Fuzz-3 | GET /props | 200 | HTTP 200 1ms | PASS |
| Fuzz-3 | POST /props | 405 | HTTP 200 1ms | FAIL |
| Fuzz-3 | PUT /props | 405 | HTTP 200 1ms | FAIL |
| Fuzz-3 | DELETE /props | 405 | HTTP 200 1ms | FAIL |
| Fuzz-3 | GET /v1/monitor/recent | 200 | HTTP 200 1ms | PASS |
| Fuzz-3 | POST /v1/monitor/recent | 405 | HTTP 200 1ms | FAIL |
| Fuzz-3 | PUT /v1/monitor/recent | 405 | HTTP 200 1ms | FAIL |
| Fuzz-3 | DELETE /v1/monitor/recent | 405 | HTTP 200 1ms | FAIL |
| Fuzz-4 | Mailbox.push kind=lockdown | {ok:false} | ok:true | FAIL |
| Fuzz-4 | Mailbox.push kind=reboot | {ok:false} | ok:true | FAIL |
| Fuzz-4 | Mailbox.push kind=vote | {ok:false} | ok:true | FAIL |
| Fuzz-4 | Mailbox.push kind=hop (control) | {ok:true} | ok:true | PASS |
| Fuzz-5 | ipc.lockdown() | {kind:'reject', ok:false, executed:false} no throw | THROW complex-last | FAIL |
| Fuzz-5 | ipc.reboot() | {kind:'reject', ok:false, executed:false} no throw | THROW complex-last | FAIL |
| Fuzz-5 | ipc.secure_reboot() | {kind:'reject', ok:false, executed:false} no throw | THROW complex-last | FAIL |
| Fuzz-5 | respond.lockdown() | {kind:'reject', ok:false, executed:false} no throw | ok:false kind:reject executed:false lockdown is uncallable (v1; respond records votes, never executes) | PASS |
| Fuzz-5 | respond.reboot() | {kind:'reject', ok:false, executed:false} no throw | ok:false kind:reject executed:false reboot is uncallable (v1; respond records votes, never executes) | PASS |
| Fuzz-5 | isolate.lockdown() | {kind:'reject', ok:false, executed:false} no throw | THROW complex-last | FAIL |
| Fuzz-5 | isolate.reboot() | {kind:'reject', ok:false, executed:false} no throw | THROW complex-last | FAIL |
| Fuzz-5 | network.lockdown() | {kind:'reject', ok:false, executed:false} no throw | THROW complex-last | FAIL |
| Fuzz-5 | network.reboot() | {kind:'reject', ok:false, executed:false} no throw | THROW complex-last | FAIL |
| Fuzz-5 | GET /lockdown | 404 (8080 never owns reboot) | HTTP 404 not_found 1ms | PASS |
| Fuzz-5 | POST /lockdown | 404 (8080 never owns reboot) | HTTP 404 not_found 1ms | PASS |
| Fuzz-5 | GET /reboot | 404 (8080 never owns reboot) | HTTP 404 not_found 1ms | PASS |
| Fuzz-5 | POST /reboot | 404 (8080 never owns reboot) | HTTP 404 not_found 1ms | PASS |
| Fuzz-6 | POST /route missing Content-Type + JSON body | 400 even if body is JSON | HTTP 200 6587ms | FAIL |
| Fuzz-6 | POST /route text/plain + valid JSON | 400 even if body is JSON | HTTP 200 613ms | FAIL |
| Fuzz-6 | POST /route empty Content-Type + JSON body | 400 even if body is JSON | HTTP 200 6598ms | FAIL |
| Fuzz-6 | POST /route application/json + messages=[] | 200 | HTTP 200 653ms | PASS |
| F-B7 | GET /v1/monitor/recent Origin http://localhost | 200, no ACAO reflect | HTTP 200 1ms ACAO=http://localhost | FAIL |
| F-B8 | GET /v1/monitor/recent tickets hashed (not UUID-shaped) | 200, ticket not UUID-shaped | HTTP 200 1ms tickets=26 uuid_shaped=26 sample=e752649a-9ce0-4cb3-963d-742da51ba97a | FAIL |
| RF9 | HEAD /health (8s timeout) | 400 fast (not ~6s stall) | HTTP 200 1ms | FAIL |
| RF9 | TE-chunked GET /health (8s timeout, no chunks) | 400 fast (not ~6s stall) | HTTP 200 6002ms STALL | FAIL |

## Notes

- Fuzz-1/2: `messages` number/bool/object → 500 `internal_error`; string → 200 (char-iterate). `/route` `[]` / omitted still 200.
- Fuzz-3: GET-family ignores method (POST/PUT/DELETE still 200).
- Fuzz-4: Mailbox lockdown/reboot/vote still `ok:true`. hop control `ok:true`.
- Fuzz-5: `respond.lockdown/reboot` already reject envelope. `ipc`/`isolate`/`network` throw `complex-last`. HTTP 404 stays; 8080 never owns reboot.
- Fuzz-6: missing / text/plain / empty CT still parse JSON (200). `application/json` + `messages=[]` 200.
- F-B7: Origin `http://localhost` reflected as ACAO.
- F-B8: GET `/v1/monitor/recent` 200; tickets UUID-shaped (not hashed).
- RF9: HEAD `/health` 200 in 1ms (no stall, but not 400). TE-chunked GET no chunks → 200 after 6002ms stall, not 400 fast.

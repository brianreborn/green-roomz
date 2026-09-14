# Green-Roomz fuzz review

Latest: **modality checkpoint** 2026-09-06 11:36 PM PT — see section below. Prior P0 history retained under “Pass 1 (archived)”.
Pass4 (P0 post-bounce): `/workspace/reviews/fuzz-pass4.md` (55/55 PASS).

---

## Modality pass (checkpoint 2026-09-06 11:36 PM PT / 2026-09-07T06:36:53Z)

- **checkpoint:** Researcher ~89% usage — board written; **paused**.
- target: http://127.0.0.1:8080 cwd `/workspace/e2e-fresh/green-roomz` gateway_pid **2348422** (unchanged through suite)
- llama :8187 up; GET /health 200 degraded
- **instruct landed:** **no** — only `models/Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf`; specialists still `missing-*`
- raw: `/workspace/reviews/_scratch/fuzz-modality-cases.jsonl` (35 cases; suite stopped mid-run for checkpoint)
- no WAN; no git push; no lockdown; no stop.sh

### Counts

total≈35  pass=28  fail/findings=7  hangs=0  crashes=0

### OK

- `/route` text → 200 plan (default_text → general-text-speculator)
- real `/v1/chat/completions` ping max_tokens=8 → **200** via **tool-router-agent** (~632ms)
- explicit `tool-router-agent` → 200
- P0 `messages=42` → still **400**
- image_url on `/completions` → **503** (no text fallthrough) ✅
- input_audio on `/completions` → **503** ✅
- `/vision` without image → 400; `/audio` without audio → 400
- corrupt/non-data image or audio → 503
- POST `/health` 405; GET `/lockdown` 404; monitor/recent 200; pid stable after 503s
- slash `/text` `/code` `/auto` on `/route` plan 200

### FINDINGS (missing→real gap)

Unavailable specialists do **not** 503 when selected by `model:` or slash on **completions** — gateway serves **tool-router** 200 instead:

| case | expected | observed |
|---|---|---|
| `model: general-text-speculator` | 503 missing-instruct | **200 tool-router** (~207ms) |
| `model: qwenstral-code-speculator` | 503 missing-instruct | **200 tool-router** |
| `model: image-generation-agent` | 503 missing-sd | **200 tool-router** |
| slash `/draw` `/imagine` completions | 503 or native image path | **200 tool-router** (`/route` still plans image-generation-agent) |
| slash `/tts` `/speak` completions | 503 missing-piper | **200 tool-router** (`/route` plans speech-synthesis-agent) |

Contrast: **modality parts** (image_url / input_audio) correctly **503** and do not fall through to text (gateway hard gate).

### Missing→real

- **Real:** tool-router / nexus Qwenstral 0.5B — chat works.
- **Missing:** instruct GGUF, vision, whisper, piper, sd, embed, rerank, guard — health lists unavailable.
- Transition not yet testable for instruct (file absent). When instruct lands: re-run A3/A4 expecting specialist start or honest 503, not silent router fallthrough.

### Pause

Stopped modality executor on Researcher checkpoint. Resume after Instruct/etc land or operator unpause.


## Pass 1 (archived)

- timestamp_utc: 2026-09-03T11:31:34Z
- timestamp_pt: 2026-09-03 04:31 AM PT
- target: http://127.0.0.1:8080
- gateway_pid: 1849424 (unchanged before/after)
- llama-server pid: 1849480 on 127.0.0.1:8187 (unchanged)
- health: GET /health 200 degraded before and after
- scope: 127.0.0.1 only; no WAN; no git push; no reboot; outcomes only


> P0 history (brief): first-pass 2026-09-03 had messages=number→500; later passes fixed to **400 validation_error** (reconfirmed this modality pass A6). Full HTTP/inproc history retained below.
## Summary counts (HTTP)

total=90  2xx=48  4xx=41  5xx=1  hangs=0  crashes=0  conn_errors=0
inproc_cases=46

## Hangs >30s

- none (TE-chunked-no-chunks and CL-mismatch-GET returned 200 in ~6s)

## 500s

- FINDING: c006 POST /v1/chat/completions/route [messages=number] → 500 12ms — number 42 is not iterable (internal_error)

## Crashes (process gone)

- none; node still listening on 8080 pid 1849424; llama-server still on 8187 pid 1849480

## lockdown/reboot HTTP not-404

- none. GET/POST /lockdown /reboot /secure_reboot /v1/lockdown /v1/reboot /monitor /v1/monitor /text /code /auto /admin /shutdown all 404 not_found
- slash /reboot and /lockdown inside chat JSON returned route-plan 200 (body text), did not map to HTTP verbs

## uncallable lockdown/reboot in-process

- caller: GATEWAY_IPC_RIGHTS=49 (POST|OBSERVE|SNAPSHOT), role green-roomz
- ok:true success on lockdown/reboot/secure_reboot/vote verbs: none
- reject (ok:false): ipc.push kinds lockdown/reboot/vote; respond.lockdown/reboot/secure_reboot; network.lockdown/reboot/secure_reboot
- throw complex-last (not reject envelope): ipc.lockdown/reboot/secure_reboot/vote; isolate.lockdown/reboot/secure_reboot; api.vote/secureReboot
- throw is not execution; it is also not a reject envelope

## mailbox / ${} surprises

- Mailbox.push accepts kind lockdown/reboot/vote with ok:true (no kind allowlist / no cap check). Drain does not dispatch verbs.
- Mailbox.push also accepts wrong types, huge hashed string payload, nested objects, null envelope; drop-oldest when full
- expandEnvironment: missing key -> empty string; nested ${${FOO}} -> "${alpha}"; path-like interpolates HOME; ${foo} matches gi but looks up "foo" -> empty; huge unknown key -> empty; unclosed/${}/unicode key unchanged
- compileStockPrompt does not expand ${}; leaves them in kernel text; empty/null kernel throws TypeError

## HTTP cases (method/path/mutation → status, time_ms)

- h001 GET /health [baseline] → 200 14ms — degraded health 200
- h002 GET /v1/health [baseline] → 200 11ms
- h003 GET /v1/models [baseline] → 200 13ms
- h004 GET /health [weird-query] → 200 12ms
- h005 GET /v1/models [huge-query-nums] → 200 11ms
- h006 GET /health [huge-header-8k] → 200 11ms
- h007 POST /health [POST-on-GET-route] → 200 12ms — POST /health still 200 (method ignored)
- h008 PUT /health [PUT-on-GET-route] → 200 10ms — PUT /health still 200
- h009 DELETE /v1/models [DELETE-on-models] → 200 12ms — DELETE /v1/models still 200
- h010 PATCH /v1/health [PATCH-on-health] → 200 11ms — PATCH /v1/health still 200
- h011 OPTIONS /health [OPTIONS] → 204 11ms — OPTIONS 204
- h012 HEAD /health [HEAD] → 200 6013ms — HEAD 200; curl 18 (no body vs Content-Length)
- h013 GET /metrics [baseline] → 200 13ms
- h014 GET /props [baseline] → 200 12ms
- h015 GET /v1/monitor/recent [allowed-readonly] → 200 12ms — allowed read-only 200
- h016 GET /v1/monitor/recent [monitor-recent-weird-query] → 200 12ms
- h017 GET /lockdown [must-404-GET] → 404 11ms
- h018 POST /lockdown [must-404-POST] → 404 11ms
- h019 GET /reboot [must-404-GET] → 404 11ms
- h020 POST /reboot [must-404-POST] → 404 12ms
- h021 GET /secure_reboot [must-404-GET] → 404 12ms
- h022 POST /secure_reboot [must-404-POST] → 404 11ms
- h023 GET /v1/lockdown [must-404-GET] → 404 12ms
- h024 POST /v1/lockdown [must-404-POST] → 404 12ms
- h025 GET /v1/reboot [must-404-GET] → 404 10ms
- h026 POST /v1/reboot [must-404-POST] → 404 11ms
- h027 GET /monitor [must-404-GET] → 404 11ms
- h028 POST /monitor [must-404-POST] → 404 12ms
- h029 GET /v1/monitor [must-404-GET] → 404 10ms
- h030 POST /v1/monitor [must-404-POST] → 404 11ms
- h031 GET /text [must-404-GET] → 404 10ms
- h032 POST /text [must-404-POST] → 404 11ms
- h033 GET /code [must-404-GET] → 404 11ms
- h034 POST /code [must-404-POST] → 404 11ms
- h035 GET /auto [must-404-GET] → 404 11ms
- h036 POST /auto [must-404-POST] → 404 11ms
- h037 GET /admin [must-404-GET] → 404 10ms
- h038 POST /admin [must-404-POST] → 404 11ms
- h039 GET /shutdown [must-404-GET] → 404 12ms
- h040 POST /shutdown [must-404-POST] → 404 11ms
- h041 GET /v1/chat/completions/../health [path-dotdot] → 404 11ms — dotdot not collapsed to /health
- h042 GET /health/ [trailing-slash] → 404 10ms
- h043 GET /HEALTH [case-mismatch] → 404 12ms
- h044 GET /v1/chat/completions [GET-on-POST-route] → 405 15ms — 405 method not allowed
- c001 POST /v1/chat/completions/route [empty-body] → 200 749ms — empty body treated as {}; route-plan 200
- c002 POST /v1/chat/completions/route [truncated-json] → 400 14ms
- c003 POST /v1/chat/completions/route [trailing-garbage] → 400 12ms
- c004 POST /v1/chat/completions/route [nested-50-deep] → 200 12ms
- c005 POST /v1/chat/completions/route [messages=string] → 200 14ms
- c006 POST /v1/chat/completions/route [messages=number] → 500 12ms 500 — FINDING 500 internal_error: number not iterable
- c007 POST /v1/chat/completions/route [messages=null] → 200 13ms
- c008 POST /v1/chat/completions/route [max_tokens=-1] → 200 12ms
- c009 POST /v1/chat/completions/route [max_tokens=0] → 200 11ms
- c010 POST /v1/chat/completions/route [max_tokens=1e20] → 200 12ms
- c011 POST /v1/chat/completions/route [max_tokens=foo] → 200 11ms
- c012 POST /v1/chat/completions/route [temperature=NaN-string] → 200 11ms
- c013 POST /v1/chat/completions/route [stream=1] → 200 11ms
- c014 POST /v1/chat/completions/route [extra-fields] → 200 11ms
- c015 POST /v1/chat/completions/route [duplicate-keys] → 200 11ms
- c016 POST /v1/chat/completions/route [unicode-zwj-rtl-emoji] → 200 19ms
- c017 POST /v1/chat/completions/route [null-byte-in-content] → 200 11ms
- c018 POST /v1/chat/completions/route [overlong-looking-utf8-raw] → 400 13ms
- c019 POST /v1/chat/completions [missing-content-type] → 200 12ms
- c020 POST /v1/chat/completions/route [form-urlencoded] → 400 11ms
- c021 POST /v1/chat/completions/route [text-plain] → 400 11ms
- c022 POST /v1/chat/completions/route [multipart] → 400 11ms
- c023 POST /v1/chat/completions/route [n-large-tools-object] → 200 13ms
- c024 POST /v1/chat/completions/route [slash-text-hi] → 200 12ms
- c025 POST /v1/chat/completions/route [slash-code-hi] → 200 12ms
- c026 POST /v1/chat/completions/route [slash-auto-hi] → 200 683ms — slash /auto consult ~683ms then 200
- c027 POST /v1/chat/completions/route [slash-council] → 200 14ms
- c028 POST /v1/chat/completions/route [slash-reboot] → 200 11ms — slash /reboot in body -> route 200, not HTTP reboot
- c029 POST /v1/chat/completions/route [slash-lockdown] → 200 13ms — slash /lockdown in body -> route 200, not HTTP lockdown
- c030 POST /v1/chat/completions/route [slash-vision] → 400 11ms — 400 /vision requires image
- c031 POST /v1/chat/completions/route [slash-zzzz] → 200 13ms
- c032 POST /v1/chat/completions/route [nested-slash] → 200 11ms
- c033 POST /v1/chat/completions/route [slash-unicode] → 200 11ms
- c034 POST /v1/chat/completions [route_plan_only-flag] → 200 12ms
- c035 POST /v1/chat/completions/route [array-body] → 400 14ms
- c036 POST /v1/chat/completions/route [json-null-body] → 400 13ms
- c037 POST /v1/embeddings [embeddings-wrong-types] → 400 12ms — 400 Unknown agent alias: 123
- c038 POST /v1/rerank [rerank-wrong-types] → 400 15ms — 400 Unknown agent alias: false
- c039 POST /v1/chat/completions/route [2MB-content] → 200 33ms — 2MB accepted
- c040 POST /v1/chat/completions/route [8MB-content] → 200 69ms — 8MB accepted
- c041 POST /v1/chat/completions [real-chat-monitor-snapshot] → 200 11ms — mailbox snapshot 200
- c042 POST /v1/chat/completions [real-chat-resident-max1] → 200 74ms — resident llama max_tokens=1 finish_reason=length
- r001 GET /health [TE-chunked-no-chunks] → 200 6008ms — Node answered 200 after ~6s, not >30s hang
- r002 GET /health [CL-mismatch-GET-no-body] → 200 6004ms — Node answered 200 after ~6s, not >30s hang
- r003 POST /v1/chat/completions/route [CL-too-small] → 400 2ms — 400 Bad Request
- r004 GET /health [TE-and-CL] → 400 0ms — 400 Bad Request (TE+CL)

## In-process cases

- p001 monitor/ipc [lockdown] → status=500 0ms — throw complex-last
- p002 monitor/ipc [reboot] → status=500 0ms — throw complex-last
- p003 monitor/ipc [secure_reboot] → status=500 0ms — throw complex-last
- p004 monitor/ipc [vote] → status=500 0ms — throw complex-last
- p005 monitor/ipc [push-kind-lockdown] → status=403 1ms — reject unknown/missing cap
- p006 monitor/ipc [push-kind-reboot] → status=403 0ms — reject
- p007 monitor/ipc [push-kind-vote] → status=403 0ms — reject
- p008 monitor/ipc [push-kind-hop] → status=200 0ms — ok hop (expected)
- p009 monitor/respond [lockdown] → status=403 0ms — reject 8080/green-roomz
- p010 monitor/respond [reboot] → status=403 0ms — reject
- p011 monitor/respond [secure_reboot] → status=403 0ms — reject
- p012 monitor/isolate [lockdown] → status=500 0ms — throw complex-last
- p013 monitor/isolate [reboot] → status=500 0ms — throw complex-last
- p014 monitor/isolate [secure_reboot] → status=500 0ms — throw complex-last
- p015 monitor/network [lockdown] → status=403 0ms — reject
- p016 monitor/network [reboot] → status=403 0ms — reject
- p017 monitor/network [secure_reboot] → status=403 0ms — reject
- p018 monitor/api [vote] → status=500 0ms — throw complex-last
- p019 monitor/api [secureReboot] → status=500 0ms — throw complex-last
- m001 mailbox [empty] → status=200 0ms
- m002 mailbox [kind-lockdown] → status=200 0ms — ok:true kind lockdown (no allowlist)
- m003 mailbox [kind-reboot] → status=200 0ms — ok:true kind reboot
- m004 mailbox [kind-vote] → status=200 0ms — ok:true kind vote
- m005 mailbox [kind-number] → status=200 0ms
- m006 mailbox [payload-array] → status=200 0ms
- m007 mailbox [huge-string-payload] → status=200 1ms
- m008 mailbox [nested-payload] → status=200 0ms
- m009 mailbox [u64-ticket] → status=200 0ms
- m010 mailbox [null-envelope] → status=200 0ms
- e001 util.expandEnvironment [missing-key] → status=200 0ms — missing key -> empty string
- e002 util.expandEnvironment [nested-${${FOO}}] → status=200 0ms — inner FOO expands; outer remains ${alpha}
- e003 util.expandEnvironment [known-FOO] → status=200 0ms
- e004 util.expandEnvironment [path-like] → status=200 0ms — path-like interpolates HOME
- e005 util.expandEnvironment [unicode-key] → status=200 0ms
- e006 util.expandEnvironment [huge-key] → status=200 0ms — unknown huge key -> empty
- e007 util.expandEnvironment [object-tree] → status=200 0ms
- e008 util.expandEnvironment [unclosed] → status=200 0ms
- e009 util.expandEnvironment [empty-braces] → status=200 0ms
- e010 util.expandEnvironment [lowercase] → status=200 0ms — gi regex + case-sensitive env lookup -> empty
- k001 compile-prompt [missing-keys-in-kernel] → status=200 1ms — compile-prompt does not expand ${}
- k002 compile-prompt [nested-in-kernel] → status=200 0ms
- k003 compile-prompt [huge-kernel-8k] → status=200 0ms
- k004 compile-prompt [path-like-kernel] → status=200 0ms
- k005 compile-prompt [unicode-kernel] → status=200 0ms
- k006 compile-prompt [empty-kernel] → status=400 0ms — compileStockPrompt(general-text-speculator): kernelText is required
- k007 compile-prompt [null-kernel] → status=400 0ms — compileStockPrompt(general-text-speculator): kernelText is required

## Notes

- Most chat used POST /v1/chat/completions/route or route_plan_only. Two real turns: monitor snapshot + resident llama max_tokens=1.
- GET /v1/monitor/recent 200 is allowed read-only, not a bug.
- GET-family routes (/health /v1/models /metrics /props /v1/monitor/recent) ignore method and still 200/204.
- No WAN. No git push. Machine not rebooted. Tester did not kill the gateway.

## Modality pass (2026-09-06 PT)

- target: http://127.0.0.1:8080 cwd /workspace/e2e-fresh/green-roomz pid **2348422** (unchanged); llama :8187 pid 2348463
- instruct landed: **no** (health still unavailable for general-text/qwenstral-code citing missing-qwen-instruct.gguf). Mid-run disk grew Qwen2.5-0.5B-Instruct-Q4_K_M.gguf + hardlink named missing-qwen-instruct.gguf; gateway not rematerialized — treat as not landed.
- only ready: tool-router-agent + security-monitor-agent. Specialists missing (vision/whisper/sd/piper/embed/rerank/guard/instruct-runtime).
- summary: cases≈32+details  pass≈28  fail/findings=7  503=4  **500=0**  hangs=0  crashes=0
- raw: `/workspace/reviews/_scratch/fuzz-modality-cases.jsonl`

### Table

| id | case | status | ms | note |
|----|------|--------|----|------|
| A1 | /route hi | 200 | ~13 | plan general-text-speculator default_text |
| A2 | /completions ping max_tokens=8 | 200 | ~632 | real nexus/tool-router |
| A3 | model general-text-speculator | **200** | ~207 | FINDING fallthrough tool-router (not 503) |
| A4 | model qwenstral-code-speculator | **200** | ~199 | FINDING fallthrough tool-router |
| A5 | slash /text /code /auto on /route | 200 | 1–2 | /text→general slash_text; /code→qwenstral slash_code; /auto→default_text |
| A6 | messages=42 | **400** | 2 | P0 still validation_error |
| B7a | image_url tiny /route | 200 | 2 | vision-layout-agent reason image_input |
| B7b | image_url /completions | **503** | 52 | agent_unavailable missing-vision; **no text fallback** |
| B8 | /vision no image | **400** | 2 | requires attached image part |
| B9 | /vision + image | 200/503 | 1/52 | plan vision; completion 503 |
| B10 | model image-gen / /draw / /imagine | **200** | ~200 | FINDING: /route plans image-generation-agent; completions fall through nexus |
| B11 | non-data/http image_url | 503/200 | 52 | completions 503 vision; route still image_input |
| C12 | input_audio | 200/503 | 1/52 | route audio-transcription; completion 503 missing whisper |
| C13 | /audio no audio | **400** | 1 | requires attached audio part |
| C14 | /tts /speak | **200** | ~200 | FINDING: /route plans speech-synthesis; completions nexus fallthrough |
| C15 | non-data audio | 503/200 | 52 | completions 503 audio-transcription |
| D16 | GET /health | 200 | 1 | ready=tool-router,security-monitor; rest unavailable |
| D17 | model tool-router-agent | 200 | ~304 | real short completion |
| D18 | after 503 health+pid | 200 | 1 | pid 2348422 unchanged |
| D19 | GET /v1/monitor/recent | 200 | 5 | no lockdown |
| D20 | POST /health; GET /lockdown | **405** / **404** | 1 | as expected |
| E21 | image+audio parts | 200/503 | 2/— | FINDING: /route→default_text; /completions→503 vision (image wins exec) |
| E22 | ~100KB base64 image | 200 | 7 | route vision-layout |
| E23 | image_url=number; messages=string | 200/400 | 1 | number still routes vision; messages=string **400** |

### Findings

1. **503 not 500** on true modality stubs (image/audio content parts) — good; type=agent_unavailable.
2. **No text fallback on image content** (B7b) — completions refuse with 503 vision-layout; matches gateway intent.
3. **Missing→real asymmetry**: unavailable *text/slash* specialists (`general-text-speculator`, `qwenstral-code-speculator`, `/draw`,`/imagine`,`/tts`,`/speak`, explicit `image-generation-agent`) **do not 503** — they silently complete via **tool-router/nexus 200**. /route *plans* the right agent; /completions ignores unavailability for these paths.
4. **Mixed image+audio**: /route drops to default_text; /completions still enforces image→503 vision. Route/exec disagreement.
5. **Crashes/lockdown**: none. Gateway pid unchanged. POST /health 405; GET /lockdown 404.
6. **missing→real**: nexus/tool-router OK; specialists missing (instruct not effectively landed).

### missing→real

- real: tool-router-agent (nexus GGUF) short completions 200
- missing: vision, whisper, sd, piper, instruct-backed text/code agents (health unavailable); modality content-parts correctly 503; slash/explicit model often fall through instead


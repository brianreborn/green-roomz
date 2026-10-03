# Fuzz review board — Green-Roomz (qodesh)

**Owner:** Fuzz Tester  
**Date (UTC):** 2026-09-12  
**Host:** qodesh (`19f2c19e-e100-49f0-8507-813d66727973`)  
**Gateway:** `http://127.0.0.1:8080`  
**Tree:** `C:\Users\brian\Documents\green-roomz`  
**Serve still up (after live HTTP):** **yes** — `/health` 200 `status=degraded` (general-text-speculator unavailable / impractical). Nexus tool-router resident.

---

## Summary counts

| Bucket | Count | Notes |
|--------|------:|-------|
| Offline expand/util (box trees) | 28 | earlier worker |
| Live HTTP cases | **137** | harness `data\_fuzz\qodesh-http-fuzz.mjs` |
| Live expand spot-checks (live tree) | 5 | |
| Crashes (client/harness) | 2 | bad Auth header rejected by fetch; oversize+1 `fetch failed` (server survived) |
| Hangs | **1** | `chat_nulls` aborted at 12s |
| HTTP 500s | **3** | unicode chat; `/tts`; `/speak` |
| Uncallable-success (P0) | **0** | all lockdown/reboot/vote HTTP → 404; `secureReboot()` reject envelope |

---

## Findings

| id | severity | surface | repro (minimal) | expected vs actual | notes |
|----|----------|---------|-----------------|--------------------|-------|
| **FUZZ-EXPAND-01** | **P1** | `expandEnvironment` (live `src/util.mjs`) | `expandEnvironment('${GRZ_ROOT}/models/x.gguf', {})` | fail closed vs `'/models/x.gguf'` | Confirmed on **live** qodesh tree. Unset `GRZ_ROOT` collapses. Overlaps Platform PATH-02 / Boundary BND-07. |
| **FUZZ-FALLTHROUGH-model_tts** | ~~P1~~ **deferred** (cold≠unavailable) | chat completions | `model: speech-synthesis-agent` | pin/503 vs **HTTP 200** `eff=tool-router-agent` | `/route` also reports tool-router (not speech). Silent fallback. |
| **FUZZ-FALLTHROUGH-model_code** | ~~P1~~ **CLOSED** | chat completions | `model: code-agent` (unknown alias) | 400/404 unknown vs **200** tool-router | Unknown alias absorbed by nexus. |
| **FUZZ-FALLTHROUGH-model_general_text** | ~~P1~~ **CLOSED** | chat completions | `model: general-text-agent` (wrong alias) | reject vs **200** tool-router | Same. Correct alias is `general-text-speculator`. |
| **FUZZ-NULL-HANG** | **P1** | `/v1/chat/completions` | body `{model:null,messages:null,max_tokens:null}` | fast 400 vs **hang ≥12s** (client abort) | Needs server-side validation timeout. |
| **FUZZ-UNICODE-500** | **P1** | chat + nexus | user content with Hebrew + ZWSP + RLO + NUL | 400/sanitized vs **HTTP 500** peg-native format error | `eff=tool-router-agent`. |
| **FUZZ-TTS-500** | **P1** | slash `/tts` `/speak` | `/tts hello` or `/speak hello` | 503 unavailable or clean error vs **HTTP 500** piper `espeak-ng-data` path `/usr/share/...` on Windows | Agent marked cold/callable; spawn fails with Unix data path. |
| **FUZZ-MAILBOX-NULL** | **P1** | `Mailbox.push` | `new Mailbox({capacity:8}).push(null)` | reject envelope vs **throws** `Cannot read properties of null (reading 'kind')` | Other bad types (undefined/number/string/array/odd objects) return `{ok:false,kind:'reject'}`. |
| **FUZZ-VOTE-ALIAS** | **P2** | monitor `api.vote()` | `api.vote()` | vote-specific reject vs returns **secure_reboot** uncallable envelope (`to:secure_reboot`) | Still `ok:false` / unexecuted — not P0. `lockdown`/`reboot` named exports **missing**; only `secureReboot`+`vote` present. |
| **FUZZ-OVERSIZE** | **P2** | body limit | POST body 16MiB+1 raw | clean 413/400 vs client `fetch failed` | Server stayed up (`/health` after). Confirm connection reset vs orderly close. |
| **FUZZ-EXPAND-02** | ~~P1~~ **OK on live** | expand | `'pre-${MISSING}-post'` empty env | live keeps token `pre-${MISSING}-post` | Box snapshot previously collapsed; **fixed/different on live tree**. |
| **FUZZ-DRAW-503** | **OK** | model/slash image-gen | `model: image-generation-agent`, `/draw`, `/imagine` | 503 unavailable | **Correct** — no silent tool-router fallthrough for image-gen. |
| **FUZZ-PATH-01** | **P2** | `resolveManifestPath` | relative `..\..\..\` | jail vs resolves outside | Offline box note; re-check Win later. |

No invented metrics. No exploit recipes. No host reboot attempted.

---

## Explicit OK

| Check | Result |
|-------|--------|
| HTTP `/lockdown` `/reboot` `/secure_reboot` `/vote` (+ `/v1/*`, `/monitor/*`) GET/POST/PUT | **404** not_found — uncallable-success **0** |
| `api.secureReboot()` | reject envelope, `ok:false`, `executed:false`, reason `secure_reboot is uncallable (v1)` |
| Serve survives oversize + fuzz storm | **yes** (degraded health, uptime continued) |
| `/draw` `/imagine` / `image-generation-agent` missing | **503** agent_unavailable |
| Nested `${}` one-pass / unresolved token keep (live) | OK for missing names |
| Mailbox.push non-null garbage | reject `ok:false` |

---

## Surfaces

| Surface | Status |
|---------|--------|
| Gateway HTTP mutate | **done** (137 cases) |
| Slash `/route` plans | **done** |
| Completions fallthrough re-verify | **done** (partial confirm) |
| Manifest `${}` | **done** live spot-check |
| Monitor stub HTTP | **done** (404) |
| Monitor stub Node API | **done** — `secureReboot`+`vote` reject; `lockdown`/`reboot` exports missing |
| Mailbox/IPC envelope mutate | **done** spot-check — null throws; other bad types reject |

---

## Scratch logs

| Path | Contents |
|------|----------|
| `C:\Users\brian\Documents\green-roomz\data\_fuzz\logs\http-cases.jsonl` | 137 live HTTP rows |
| `C:\Users\brian\Documents\green-roomz\data\_fuzz\logs\http-summary.json` | counts + fallthrough findings |
| `C:\Users\brian\Documents\green-roomz\data\_fuzz\logs\offline-live-tree.json` | expand + stub secureReboot |
| `/workspace/_scratch/fuzz/expand-env-cases.jsonl` | box offline expand |
| `/workspace/_scratch/fuzz/qodesh-http-fuzz.mjs` | harness source |

Pointer: `/workspace/reviews/fuzz/README.md`

---

## Next

1. When qodesh reconnects: finish `Mailbox` envelope fuzz + remaining `api.vote`/`lockdown`/`reboot` exports; copy jsonl to box.  
2. Hand P1s to Researcher / Boundary for integrate (expand collapse, null hang, unicode 500, TTS path, unknown-model fallthrough).  
3. Leave serve running; no push; no reboot.

**Mailbox log:** `C:\Users\brian\Documents\green-roomz\data\_fuzz\logs\mailbox-monitor.json`

## Re-hit after BND-04 / FIX-01 (2026-09-12 ~02:39Z qodesh)

| case | plan | full | verdict |
|------|------|------|---------|
| `model: code-agent` | 400 | **400** | **CLOSED** (was 200 tool-router) |
| `model: general-text-agent` | 400 | **400** | **CLOSED** |
| `model: image-generation-agent` / `/draw` `/imagine` | image-gen | **503** | still OK |
| `model: speech-synthesis-agent` | tool-router | **200** tool-router | **expected** — agent `cold` not `unavailable` (Boundary carve) |
| `/tts` `/speak` | speech-synthesis | **500** piper | not fallthrough; remains **FUZZ-TTS-500** |

Log: `data/_fuzz/logs/fallthrough-rehit-2026-09-12.json`


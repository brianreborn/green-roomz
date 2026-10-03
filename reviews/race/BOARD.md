# Race / liveness board — Green-Roomz

**Owner:** Race Reviewer  
**Date (UTC):** 2026-09-12  
**Queue:** `DISPATCH-BUGS-2026-09-12.md` #3 (null hang), #6 (mailbox null) first per Security Review P0 freeze.

---

## P0 queue (this cut)

| id | severity | surface | race / who wins | harden (defensive) | status |
|----|----------|---------|-----------------|--------------------|--------|
| **RACE-NULL-HANG** (= FUZZ-NULL-HANG / dispatch #3) | **P1** | `POST /v1/chat/completions` body `{model:null,messages:null,max_tokens:null}` | No schema gate → `hardRuleRoute` treats null messages as empty → nexus consult + `ensure`/peek under policy. Client abort @12s wins; server holds slot/port until upstream ends. Ties to cold-start + wrong-pin fallthrough (null `model` looks like “no pin” → tool-router path). | Fast-fail validate before `policy.acquire`: reject non-array `messages` / non-string `model` with **400** &lt;1s; never enter nexus/ensure on null body. | **OPEN** — queued |
| **RACE-MAILBOX-NULL** (= FUZZ-MAILBOX-NULL / dispatch #6) | **P1** | `Mailbox.push(null)` (`mailbox.mjs:111-112`) | Default `partial = {}` does **not** apply to `null`; `partial.kind` throws. Other garbage rejects `{ok:false}`. Producer crash vs ring liveness — throw wins, drain/listeners skipped. | Guard: `if (partial == null \|\| typeof partial !== 'object' \|\| Array.isArray(partial)) return {ok:false,kind:'reject',...}` before `.kind`. Cap `notes[]` / HANDOFF string length separately (covert P4 later). | **OPEN** — queued |
| **RACE-COLD-PIN** | **P1** | PM `ensure` + client/session pin | Concurrent null/bad-pin turns still cold-start or pin-stick while FUZZ-FALLTHROUGH absorbs wrong aliases as tool-router 200. Null hang amplifies: holds `--parallel 1` / policy lease during stall. | After null fast-fail: specialist eviction + health/pid bind (prior pass); wrong-pin → 503 owned by Fuzz/Boundary. | **OPEN** — depends on #3 + fallthrough |

---

## Prior pass (session tree) — still open, not this freeze’s first knife

See chat race pass + executor delta: stream `proxyJson` early `release`, PolicyGate abort hang, health TOCTOU, fail-open `profileAdmitted`, no non-resident eviction, peek cancel vs `--parallel 1`.

---

## Evidence pointers

- `/workspace/reviews/fuzz-review.md` FUZZ-NULL-HANG, FUZZ-MAILBOX-NULL  
- `/workspace/reviews/release/DISPATCH-BUGS-2026-09-12.md` §3, §6  
- Probe mailbox: `/workspace/_scratch/green-roomz-probe/green-roomz/src/mailbox.mjs:111`  
- Session gateway null path: `gateway.mjs` → `handleChatTurn` with no body schema check  

No PoCs. No push. No reboot.

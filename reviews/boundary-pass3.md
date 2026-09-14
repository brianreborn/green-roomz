# Green-Roomz boundary pass 3

Date: 2026-09-03 ~04:50 PT. Source of truth: `/workspace/reviews/integrate-refinement.md`. **Do not fork.** Tree frozen: no `src/` patch, no stop of `:8080`/`:8187`, no git.

Companions: `boundary-review.md`, `boundary-pass2.md`, `boundary-fixes.md` (P0 retargeted this turn).

---

## Bindings accepted

- **No API-key product in v1.** Loopback is the operator trust boundary. Non-loopback fail closed (`allow_peers` / public bind). Never mint `'loopback-dev'` for a non-loopback peer. F-B1 bearer mint is **P2**.
- HTTP `/lockdown` `/reboot` **404 stays OK**. In-process reboot-class → reject envelope, not throw, not `ok:true`. 8080 never owns reboot. Mask stays `CAP.POST|OBSERVE|SNAPSHOT`.
- Fuzz-1/2 `messages` non-array (number/bool/object/**string**) → **400** `validation_error`, never 500. `[]` / omitted `/route` still 200.
- Mailbox kind allowlist with RF7/Fuzz-4 (not `ok:true` on lockdown/reboot/vote).
- Dump routes GET-only (F-B30 / Fuzz-3).
- JSON CT on mutating POST (F-B2). CORS default empty + OPTIONS after `peerAllowed` (F-B7).
- Hashed tickets + `sessions.patch` allowlist (F-B8). Session-local/empty monitor dump is **P1** F11, not this cut.
- `${}` allowlist fail-closed this cut (F-B14 / Fuzz-10). Platform owns percent-VAR / Darwin NFC / default `GRZ_ROOT` (PF2) — **not us**.
- Nexus 4 on this 8-core box; do not drop to 2. Homoglyphs stay after F4. No SAB/CUDA ring. No enabling reboot-class.

---

## Our P0 this cut (Researcher apply order items 4 and 8)

| ID | Status vs live fuzz-pass2 | Tests |
|---|---|---|
| **Fuzz-1/2 / B27** `messages` array | FAIL live: 42/true/`{}`/1.5 → 500; `"hi"` → 200 char-walk | 400 `validation_error` on `/route` **and** `/v1/chat/completions`; `[]`/omitted `/route` 200 |
| **F-B2 / Fuzz-6** JSON CT | FAIL live: missing CT + JSON 200; `text/plain` + JSON 200 | missing / `text/plain` / empty CT on mutating POST → 400 even if body is JSON |
| **F-B30 / Fuzz-3** GET-only dumps | FAIL live: POST/PUT/DELETE `/health` `/v1/models` `/metrics` still 200 | those methods → **405**; GET still 200 |
| **F-B7** CORS empty + OPTIONS peer | FAIL live: `Origin: http://localhost` ACAO on GET recent / POST `/route` / OPTIONS | default `cors_origins: []`; port-80 Origin not reflected; OPTIONS from denied peer **403**; no `*` |
| **F-B8** hashed tickets + patch allowlist | FAIL live: `/v1/monitor/recent` tickets are UUIDs | dump has no UUID-shaped `ticket`; `patch({identity,id,expiresAt})` ignored |
| **F-B4 / Fuzz-5** uncallable reject | FAIL in-proc: ipc/isolate/network/api throw `complex-last`; HTTP 404 OK | methods return reject envelope, **no throw**; HTTP 404 stays |

Not this cut: F-B1 default-on bearer, F-B3 MONITOR accept-list (P1 with F11), F-B9 kernel prepend, F-B20 exact `/route`, F-B19 headers, F-B21 path codes, F-B28 cache_prompt (P1 with F3/F8).

---

## Platform fold (cite only)

`platform-review.md` + `platform-pass2.md` + `platform-fixes.md` exist. Researcher: **not this `src/` security cut** except:

- **PLAT-P1 / B14:** empty `${}` → `/runtime/llama-server`. This cut: allowlist + `Object.hasOwn` + fail closed on empty command. PF2 owns default `GRZ_ROOT`, percent-VAR, Darwin NFC.
- **LIVE-SUSPEND :8184:** SIGSTOP specialist still LISTENs. Race RF4 + platform PF1/PF7. We do not stop live serve to prove it. No `/stop` route this cut (HTTP 404 is correct until they add a drain).
- Platform note that F-B1 bearer in launchers is **compatible later**. This cut: **do not** set `GREEN_ROOMZ_API_KEY` in start.sh.

Do not invent OS/path/signal findings beyond those files. Do not run `stop.sh`.

---

## Fuzz fold

`fuzz-pass2.md` / `fuzz-fixes.md` lock Fuzz-1..5. We share: Fuzz-1/2 = B27, Fuzz-3 = F-B30, Fuzz-4 = B12, Fuzz-5 = B4, Fuzz-6 = F-B2, Fuzz-7 = F-B7. String `messages` **must 400** (pass2 c005 200). `text/plain` + valid JSON **must 400** (pass2 explicit). Policy grade `stop`/`wipe` still names reboot verbs (B5, P1). `${constructor}` still hits prototype (B14, P1 this stitch as F-B14 in Researcher P1 list).

---

## Fix pack retarget

`boundary-fixes.md` P0 is now **only** F-B2, F-B7, F-B8, F-B27, F-B30, plus F-B4 reject envelopes (apply order item 8). F-B1 moved to P2. F-B8 tests no longer require two bearers — hashed tickets under shared `'loopback-dev'` is enough this cut.

Done when (our slice of beta-0.3): `messages=number` → 400; mailbox lockdown `ok:false`; POST `/health` → 405; mutating POST without JSON CT → 400; CORS default empty; in-process reboot-class is a reject envelope; 8080 still cannot reboot; monitor dump tickets are not UUIDs.

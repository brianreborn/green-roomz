# Dispatch / routing “goes wonky” — MAJOR bugs catalog

**Date:** 2026-09-12  
**Owner (catalog):** Release Driver (operator priority)  
**Baseline tip:** `brianreborn/green-roomz` `main@eb4a9f7` (`eb4a9f74bef93c2792c34041a03a0d33eb0f9e5f`)  
**Rule:** Evidence only from public GitHub (issues/commits/boards already mirrored), `/workspace/reviews/*`, `/workspace/session/*`, `/workspace/grz-src/*`. No invented bugs.

**Sources consulted**
| Source | What was used |
|--------|----------------|
| GitHub HTML issues list + #1, #7, #8, #9 | Vision path, council cascade/quorum, stock-prompt tracker |
| GitHub commit search (public API) | `c702f21`, `8779842`, `9889493`, `381491c`, `eaa852a`, `b0f0262`, council/routing SHAs |
| `brianreborn/green-agentz` issues (search + #3, #7) | Brainz/IRQ not on Roomz :8080; Shepherdz/mailbox hold |
| `/workspace/reviews/{boundary,fuzz,release,covert,green-roomz,platform}` | BND-*, FUZZ-*, prettify gates, mailbox envelopes |
| `/workspace/session/known-bugs.md`, `routing-prettify-findings.md`, `session-handoff-2026-08-28.md` | Live routing failure modes |
| `/workspace/grz-src/{nexus,routing,gateway,handoff}.mjs` | `routeIsBad`, enum filter, `|after:` reason path |
| Race board dir | **empty** (`/workspace/reviews/race/` has no BOARD.md); race items cited from RELEASE-READINESS / covert / fuzz only |

**API note:** Core GitHub REST rate-limit hit mid-pass; issues/bodies recovered via public HTML + prior board mirrors (`ongoing-dev-efforts-2026-09-12.md`). Commit search still returned results.

---

## Ranked major dispatch failure modes

Severity ranking = operator impact on offline security workstation (wrong agent, silent wrong path, hang, cascade confusion) × evidence strength.

### 1. Silent wrong / unknown `model` absorbed as tool-router (P1) — **STILL OPEN**

| | |
|--|--|
| **Symptom** | Chat completions with wrong/unknown aliases return **HTTP 200** with `eff=tool-router-agent` instead of pin/503/400. Operator thinks a specialist answered; nexus answered. |
| **Evidence** | `/workspace/reviews/fuzz-review.md` **FUZZ-FALLTHROUGH-model_tts**, **FUZZ-FALLTHROUGH-model_code**, **FUZZ-FALLTHROUGH-model_general_text** (live qodesh 137-case harness). Contrast: **FUZZ-DRAW-503** correctly 503s image-gen (no silent fallthrough). |
| **vs `main@eb4a9f7`** | **Open** on live qodesh tree (2026-09-12 fuzz). Related *safety-net* commits on main (`c702f21` never-fail-closed → general-text; `8779842` auto-route → real general-text not router echo) fix *fail-closed / echo* classes, **not** this silent tool-router absorption of bad pins. |
| **Minimal repro (defensive)** | `POST /v1/chat/completions` with `model: code-agent` or `speech-synthesis-agent` or `general-text-agent` (wrong alias) + tiny user message; compare `x-green-roomz-effective-alias` / `/route` to expected reject/503. |
| **Owner** | **Fuzz** (repro gate) + **Release Driver** (integrate reject/503 policy) + **Boundary** (capability/alias gate) |

### 2. Vision-first hop → reject → ugly `|after:vision without image part` (cut-2 gate) — **STILL OPEN (live)**

| | |
|--|--|
| **Symptom** | Plain-text turns: 0.5B nexus still proposes `vision-layout-agent`; gateway rejects; reason looks like `default_text\|after:vision without image part`. `/route` can look “right” while hop history is wonky. |
| **Evidence** | `/workspace/session/known-bugs.md` “Vision-first hop”; `routing-prettify-findings.md` ugly #1; `session-handoff-2026-08-28.md`; `/workspace/reviews/release/RELEASE-READINESS.md` + `green-roomz/RELEASE-READINESS.md` (“Routing prettify **NOT landed**”); Senior Dev note mirrored on release board. Code path: `/workspace/grz-src/nexus.mjs` `routeIsBad` → `'vision without image part'` then `reason: \`${offline.reason}\|after:${bad}\``. |
| **vs `main@eb4a9f7`** | **Enum filter exists in box `/workspace/grz-src/nexus.mjs` `postNexus` (omit vision/audio from AVAILABLE unless modality)** but boards state prettify **never bounced live** / not the cut-2-closed gate. Issue **#1** fixed *unreachable VL → text 500* class on main-era SHALOM (503 for image/audio when specialist unreachable; profiles) — **different** from text→vision false-start. |
| **Minimal repro** | Text-only chat (no image part), no slash; inspect `x-green-roomz-route-reason` for `after:vision without image part`. |
| **Owner** | **Release Driver** (land + bounce) + **Boundary** (modality gate overlap BND-03) + **Fuzz** (regression) |

### 3. Null / malformed chat body hangs (≥12s) — **STILL OPEN**

| | |
|--|--|
| **Symptom** | `{model:null,messages:null,max_tokens:null}` hangs until client abort (~12s) instead of fast 400. |
| **Evidence** | `fuzz-review.md` **FUZZ-NULL-HANG** (1 hang in live HTTP suite). |
| **vs `main@eb4a9f7`** | **Open** on live qodesh; no commit search hit claiming a null-body validation timeout fix. |
| **Minimal repro** | `POST /v1/chat/completions` with all-null body; assert server responds &lt;1s with 400 (client abort at 12s is failure). |
| **Owner** | **Race** (liveness / timeout) + **Fuzz** (keep gate) + **Release Driver** |

### 4. Slash first-hop skips modality / capability gate — **STILL OPEN**

| | |
|--|--|
| **Symptom** | `/vision` with no image locks `vision-layout-agent` (blind specialist). `/embed` `/rerank` `/tts` `/audio` on chat path → 400 / wrong endpoint / 500. |
| **Evidence** | Boundary **BND-03** (`/workspace/reviews/boundary/BOARD.md`); `known-bugs.md` `/vision` no image + `/embed`/`/rerank`/`/tts`/`/audio`; fuzz **FUZZ-TTS-500** (`/tts` `/speak` → HTTP 500 piper path). |
| **vs `main@eb4a9f7`** | Slash map + sanitizers on main since **`381491c`**; security slash/wrong-tool **`9889493`** on tip ancestry — **modality reject on slash still open** per BND-03 / known-bugs. |
| **Minimal repro** | Chat body whose first user line is `/vision` with no image part; expect reject, not lock. Separately `/tts hello` → clean 503/error not 500. |
| **Owner** | **Boundary** + **Release Driver**; **Fuzz** re-check TTS |

### 5. Text-only image-gen intent routes to general-text — **STILL OPEN**

| | |
|--|--|
| **Symptom** | “draw a red apple” / “A red apple” without `/image` never reaches `image-generation-agent`. |
| **Evidence** | `known-bugs.md`; `routing-prettify-findings.md` ugly #2; RELEASE-READINESS prettify bullet (`offlinePlan` image-gen). |
| **vs `main@eb4a9f7`** | **Open** (prettify not landed live). |
| **Minimal repro** | Text-only “draw a red apple” without slash; expect `image-generation-agent` or explicit unavailable 503 — not silent general-text poem. |
| **Owner** | **Release Driver** (offlinePlan) + **Fuzz** |

### 6. Mailbox / IPC envelope fragility (null throw; unbounded notes) — **STILL OPEN**

| | |
|--|--|
| **Symptom** | `Mailbox.push(null)` throws (`Cannot read properties of null (reading 'kind')`) while other garbage rejects. Nexus `notes[]` / HANDOFF strings are variable-length content mailbox across agents. No fixed-frame `mailbox.mjs` in src/grz-src. |
| **Evidence** | **FUZZ-MAILBOX-NULL**; covert **M4** (`covert-channel-reviewer-first-pass.md`); covert `fix-pack-2026-09-12.md` §2 “Constant-size mailbox envelopes” present?**no**; RELEASE-READINESS “Race / liveness cut open — mailbox/IPC, cold starts”; commit **`eaa852a`** “Land mailbox observer…” / **`b0f0262`** “Wire monitor IPC…” on main (observer landed; envelope harden not). |
| **vs `main@eb4a9f7`** | Observer/IPC **on main**; null-reject + constant envelopes **still open**. |
| **Minimal repro** | Unit: `new Mailbox({capacity:8}).push(null)` → must `{ok:false}` not throw. Optional: measure `Previous HANDOFF:` length growth across hops. |
| **Owner** | **Race** + **Fuzz**; covert pack P4 informs design |

### 7. Unicode / control content → HTTP 500 on tool-router path — **STILL OPEN**

| | |
|--|--|
| **Symptom** | Hebrew + ZWSP + RLO + NUL in user content → **HTTP 500** peg-native format error with `eff=tool-router-agent`. |
| **Evidence** | **FUZZ-UNICODE-500**. |
| **vs `main@eb4a9f7`** | Sanitizers for headers/HANDOFF on main (`381491c` / grz-src `stripControls`); **this chat-content 500 still open** on live fuzz. |
| **Minimal repro** | Chat with mixed bidi/NUL user content; expect 400/sanitized, not 500. |
| **Owner** | **Boundary** + **Fuzz** + **Release Driver** |

### 8. `/router` vs “nexus not user-visible” — **STILL OPEN (unverified live)**

| | |
|--|--|
| **Symptom** | `/router` maps to `tool-router-agent`; `routeIsBad` treats nexus/auto as not user-visible — may work on `/route` and fail on chat hops. |
| **Evidence** | `known-bugs.md`; `routing-prettify-findings.md`; handoff 2026-08-28; code `/workspace/grz-src/nexus.mjs` `routeIsBad` (`NEXUS_ALIAS` / `auto`); `handoff.mjs` drops suggest for `tool-router-agent`. |
| **vs `main@eb4a9f7`** | Behavior class still flagged open/unverified. |
| **Minimal repro** | `/router` on chat completions vs `POST .../route`; compare effective alias and errors. |
| **Owner** | **Release Driver** + **Fuzz** |

### 9. Historical: vision request fell through to text → 500 mmproj — **FIXED on main lineage**

| | |
|--|--|
| **Symptom (was)** | Image request: VL cold-start failed → fell to resident text nexus → `500 "image input is not supported - provide mmproj"`. Also `route_exhausted` / “No specialist accepted this turn”. |
| **Evidence** | GitHub **#1** body + comments (2026-08-30): profiles `[]`, fix → clean **503** for unreachable image/audio; never text fallback for multimodal; RAM advisory. Commits cited in boards: `c702f21` never-fail-closed; issue refs `5cdd03c` / `260db2a`. Comment claims `584d2b9` — **that SHA is not on the public remote** (per `ongoing-dev-efforts-2026-09-12.md`); treat behavioral claim as issue-comment evidence, tip as `main@eb4a9f7`. |
| **vs `main@eb4a9f7`** | **Fixed** (do not regress: multimodal must 503, not text). |
| **Owner** | Regression gate: **Fuzz** (**FUZZ-DRAW-503** pattern) + **Race** (cold-start / ensure) |

### 10. Auto-route / router-echo answering as the user-visible reply — **FIXED on main**

| | |
|--|--|
| **Evidence** | Commit **`8779842`** `fix(routing): auto-route falls back to a real general-text answer, not the router echo`; **`c702f21`** unconditional general-text safety net. |
| **vs `main@eb4a9f7`** | **Fixed** (ancestry of tip). Remains distinct from failure mode #1 (wrong pin → tool-router 200). |

### 11. Security slash / wrong-tool handoff path — **LANDED on main; keep regression**

| | |
|--|--|
| **Evidence** | Commit **`9889493`** `feat(security): add security slash dispatches, wrong-tool handoffs, and activity watchdog`; note9 plan / PLANNING-PACKAGE cite on `main`. |
| **vs `main@eb4a9f7`** | **On tip ancestry**. Not a remaining bug; listed so Rapid Iteration does not re-break wrong-tool handoffs while fixing fallthrough. |
| **Owner** | **Boundary** + **Release Driver** (regression) |

### 12. Council cascade / quorum fan-out incomplete — **OPEN / UNMERGED (hold)**

| | |
|--|--|
| **Symptom** | Cascade/escalate and N-of-M early-cancel not on `main`; full fan-out always if council used. Issue #9 notes judge=security-monitor has **no backend** if naively wired. |
| **Evidence** | Issues **#7**, **#8**, **#9**; branches `wip/council-cascade@7414812`, `wip/council-quorum@727d344` (boards; #8 comment cites `de2ce15` — **not on remote**, tip is `727d344`). PLANNING-PACKAGE: **do not merge during note9 UAT**. |
| **vs `main@eb4a9f7`** | Stock `/council` slash / weighted vote **on main** (`9e671ba`…`445e5ad`); cascade/quorum **not** on main. |
| **Owner** | **Release Driver** (merge order after note9); not Race/Fuzz for alpha cut |

### 13. Brainz / IRQ / Dreamcatcher not on live Roomz dispatch path — **STILL OPEN (seam)**

| | |
|--|--|
| **Symptom** | Cognitive interrupt / nap / promote not driving gateway hops; Roomz can “dispatch” without Brainz lease signals. |
| **Evidence** | green-roomz **#10**; green-agentz **#3** (IRQ/Dreamcatcher/scheduler **not imported by Roomz**); agentz **#7** Shepherdz/mailbox observe-only hold. Partial land `1d8bbb9` Brainz import cited in ongoing-dev; still open until live :8080. |
| **vs `main@eb4a9f7`** | Import seam partial; **live IRQ dispatch open**. |
| **Owner** | **Release Driver** (integrator) — after note9; not rapid alpha unless operator asks |

---

## Fixed on `main@eb4a9f7` vs still open (dispatch-relevant)

| Mode | Status @ `eb4a9f7` / live boards |
|------|----------------------------------|
| Never-fail-closed → general-text (`c702f21`) | **Fixed on main** |
| Auto-route router-echo (`8779842`) | **Fixed on main** |
| Multimodal → text 500 / route_exhausted (#1 class) | **Fixed on main lineage** (503 path); keep regression |
| Security slash + wrong-tool handoffs (`9889493`) | **Landed on main** |
| Slash/sanitizers (`381491c`) | **Landed on main**; session box tree may lag |
| Mailbox observer / monitor IPC (`eaa852a`, `b0f0262`) | **Landed**; envelope harden **open** |
| Council slash / weighted vote | **On main**; cascade/quorum **unmerged** |
| Silent wrong-alias → tool-router | **Open** (fuzz) |
| Vision-first / `|after:vision…` prettify | **Open** live cut-2 |
| Null-body hang | **Open** |
| Slash modality / TTS 500 | **Open** |
| Text-only draw → general-text | **Open** |
| Mailbox.push(null) + constant envelopes | **Open** |
| Unicode → 500 | **Open** |
| `/router` visibility | **Open** (unverified) |
| Brainz IRQ on :8080 | **Open** seam |
| Race BOARD.md | **Missing** (dir empty) — cold-start cut still called out in RELEASE-READINESS |

---

## Suggested fix owners (this SuperGrok team)

| Mode | Primary | Secondary |
|------|---------|-----------|
| #1 Wrong-alias → tool-router | **Fuzz** + **Release Driver** | Boundary |
| #2 Vision-first / prettify | **Release Driver** | Boundary, Fuzz |
| #3 Null hang | **Race** | Fuzz, Release Driver |
| #4 Slash modality / TTS | **Boundary** | Fuzz, Release Driver |
| #5 Text-only image-gen | **Release Driver** | Fuzz |
| #6 Mailbox envelopes / null | **Race** | Fuzz, Covert pack |
| #7 Unicode 500 | **Boundary** | Fuzz |
| #8 `/router` | **Release Driver** | Fuzz |
| #9–#11 regressions | **Fuzz** | Boundary |
| #12 Council WIP | **Release Driver** (hold) | — |
| #13 Brainz seam | **Release Driver** (post-note9) | — |

---

## Top 5 rapid-iteration fix order

1. **Reject / 503 unknown & wrong-pin aliases** (stop silent `eff=tool-router`) — highest “dispatch goes wonky” operator confusion; fuzz already has cases.  
2. **Land routing prettify + bounce** (omit vision/audio from AVAILABLE unless modality; final reason only; kill `|after:vision without image part` on text).  
3. **Fast-fail null/malformed chat bodies** (server validation timeout / 400) — kills the only recorded hang class.  
4. **Slash modality gates (BND-03)** + TTS clean unavailable (no 500) — stops blind `/vision` and chat-path wrong-tool locks.  
5. **Mailbox.push(null) harden + notes length bound** (Race) — security-monitor path; pairs with constant envelopes later.

**Defer this cut:** council #7/#8 merge; Brainz IRQ live wire; full constant-size `mailbox.mjs` (covert P4) unless Race needs it for #5.

---

## File / SHA quick index

| Cite | Kind |
|------|------|
| green-roomz **#1** | Vision path / 503 fix narrative |
| green-roomz **#7/#8/#9** | Council cascade/quorum / tracker |
| green-roomz **#10** / agentz **#3** | Brainz not on :8080 |
| `c702f21` `8779842` `9889493` `381491c` `eaa852a` `b0f0262` | Main dispatch-related commits |
| `wip/council-cascade@7414812` `wip/council-quorum@727d344` | Unmerged |
| `/workspace/grz-src/nexus.mjs` | `routeIsBad`, `|after:`, enum filter |
| `/workspace/session/known-bugs.md` | Live routing open list |
| `/workspace/reviews/fuzz-review.md` | Fallthrough / hang / mailbox / unicode |
| `/workspace/reviews/boundary/BOARD.md` | BND-03 slash modality |
| `/workspace/reviews/release/RELEASE-READINESS.md` | Prettify + race/mailbox gates |


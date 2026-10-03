# Nexus / model-pack iterate lane — THIS team / Release Driver

**Date:** 2026-09-12  
**Authority:** New Bot (operator priority add)  
**Mutex:** `routing.mjs` — PR #12 post-merge tip sync **only** (no parallel rewrite)  
**Do not block on:** gateway P0 #2 (vision-first/prettify live bounce) — **held for OTHER team**

## Lane ownership

| Work | Owner |
|------|-------|
| Model-pack experiments (better nexus than current 0.5B) | **THIS team / Release Driver** |
| Nexus eval harness (route quality metrics, not gateway rewrite) | **THIS team / Release Driver** |
| Gateway P0 #2 vision-first / prettify bounce | **OTHER** (do not wait) |
| BND-03 slash modality | Boundary / OTHER integrate queue |
| `routing.mjs` / gateway code edits | **hold** except PR #12 sync |

## Current nexus failure modes (evidence only — already on boards)

| ID | Mode | Evidence | Status vs FIX-01 |
|----|------|----------|------------------|
| NX-01 | Vision-first: 0.5B proposes `vision-layout-agent` on plain text → reject → `\|after:vision without image part` | known-bugs; prettify findings; DISPATCH #2; grz-src enum filter not live | **OPEN** (gateway P0#2 / OTHER) |
| NX-02 | Text-only “draw/generate image” → general-text, not image-gen | known-bugs; offlinePlan gap | **OPEN** (prettify / model+prompt also) |
| NX-03 | Reason string is hop history, not final decision | prettify ugly #3 | **OPEN** |
| NX-04 | Unicode/bidi/NUL user content → HTTP 500 on tool-router path | FUZZ-UNICODE-500 | **OPEN** (content sanitize / model) |
| NX-05 | `/router` vs nexus “not user-visible” | known-bugs; unverified live | **OPEN** |
| NX-06 | Sticky/cold specialist pin → nexus 200 (e.g. speech `cold`) | Senior Dev bounce; Boundary carve | **by design** until product wants always-pin |
| NX-07 | Wrong/unknown model → silent tool-router 200 | FUZZ-FALLTHROUGH-* | **CLOSED** live (FIX-01 / BND-04) |
| NX-08 | fetch-models tip quirk: URL bartowski Qwen2.5-Coder-0.5B saved as Qwenstral filename | MODEL-PACK + New Bot harness note | **CONFIRMED smoking gun** — fix in pack/fetch before A/B |
| NX-09 | qodesh degraded without mid chat model; nexus 0.5B is only resident piece | fuzz-review; handoff | **capacity** — model-pack lane |

## Iterate direction (Release lane — no gateway rewrite)

1. Eval harness: fixed prompt set → expected alias / reject; score 0.5B vs candidate router models (CPU-only on qodesh; never GGUF on 8600 GT).
2. Model-pack: swap/compare resident nexus GGUFs from inventory (keep note9 T0 tiny; workstation pack larger).
3. Prompt/schema: AVAILABLE enum + json_schema hygiene **in eval** before asking OTHER for gateway prettify land.
4. Track NX-01..05 rates; do not invent new bugs.

## Non-actions

No push · no gateway.mjs edits · no routing.mjs edits until PR #12 merge sync · no CUDA on 8600 GT.

## Eval harness (landed 2026-09-12 — New Bot)

| Artifact | Path |
|----------|------|
| Gold set (35) | `/workspace/reviews/release/nexus-eval/gold-routes.json` |
| Scorer | `/workspace/reviews/release/nexus-eval/score-routes.mjs` |

**Smoking gun (NX-08 confirmed):** `fetch-models.mjs` saves under Qwenstral name but downloads **Qwen2.5-Coder-0.5B**.

**First A/B (when shalom up):** Instruct 0.5B, then 1.5B — CPU/Vulkan per host rules; never GGUF on 8600 GT. qodesh dogfood only if RAM allows and CPU-only.

`routing.mjs` mutex unchanged (PR #12).

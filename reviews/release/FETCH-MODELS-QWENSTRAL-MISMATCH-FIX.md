# FIX NOTES — fetch-models.mjs Qwenstral name ← Coder URL (NX-08)

**Date:** 2026-09-12  
**Status:** DRAFT notes only — **do not push git** · **do not edit `routing.mjs`**  
**Tip inspected:** `/workspace/gh-sync/green-roomz/scripts/fetch-models.mjs` (`main@eb4a9f7` lineage)  
**Companions:** `NEXUS-MODEL-ITERATION-2026-09-12.md` §2–3 · `NEXUS-MODEL-ITER-LANE` NX-08 · `MODEL-PACK-INVENTORY`

---

## Smoking gun (confirmed)

| Field | Current (broken) value |
|-------|------------------------|
| `alias` | `tool-router-agent` |
| `filename` | `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` |
| `url` | `https://huggingface.co/bartowski/Qwen2.5-Coder-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-0.5B-Instruct-Q4_K_M.gguf` |
| `approxBytes` | `398000000` |

**Bug:** filename / header claim **Qwenstral** (nexus / tool-router chat floor), but URL downloads **Qwen2.5-Coder-0.5B-Instruct** (code specialist). Dogfood risk: router eval scores coder weights under a Qwenstral label.

**Contrast (already correct in same file):** `general-text-speculator` correctly uses Instruct 0.5B:

- filename `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf`
- url `https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf`
- approxBytes `397808192`

---

## Recommended fix (pack / fetch only)

**Do not** treat coder-as-router as the quality target. Keep coder weights for `qwenstral-code-speculator` / code path — not nexus tool-router.

### Option 1 — Integrity swap (preferred phone floor / A candidate)

Point `tool-router-agent` **url** at **Instruct 0.5B** (same class as general-text). Keep historical **filename** `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` only if agents configs still pin that path (A/B by replacing bytes or sidecar — operator choice). Or rename filename to match Instruct and update agents configs in a **separate** pack PR (still not `routing.mjs`).

### Option 2 — Honest rename

- filename → `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` (or symlink)
- url → Instruct URL below
- Update `config/agents.*.json` model paths in pack PR later

### Leave alone until measured

- On-disk historical `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` (**460616064** bytes per session-handoff) — SHA vs tip Coder vs Instruct; do not invent hashes.
- Tip-fetched Coder SHA after download — TBD.

---

## Exact replacement URL candidates — Instruct 0.5B

Primary (matches existing `general-text-speculator` entry; bartowski Q4_K_M ~0.40 GB):

```
https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf
```

**Exact registry-line candidate (replace url only, keep filename for path-compat):**

```js
{
  alias: 'tool-router-agent',
  filename: 'Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf', // historical path-compat; or rename in pack PR
  url: 'https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf',
  approxBytes: 397808192,
  description: 'Tool router / nexus floor (0.5B Instruct — NOT Coder)',
}
```

### Alternate Instruct 0.5B URLs (same model family; pick one lineage)

| # | Candidate URL | Notes |
|---|---------------|-------|
| **A1 (preferred)** | `https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` | Already used by general-text; HF SHA256 cited on nexus board: `6eb923e7d26e9cea28811e1a8e852009b21242fb157b26149d3b188f3a8c8653` (re-verify on download) |
| **A2** | `https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_L.gguf` | Same repo; Q4_K_L (~0.40 GB) — embed/output Q8_0; only if operator wants L over M |
| **A3** | `https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf` | Official Qwen org GGUF (lowercase filename) — verify file exists on card before pin; different publisher than bartowski |

### Not for tool-router URL (keep for code specialist / later A/B)

| Role | URL |
|------|-----|
| Current broken (Coder) — **do not keep** as router | `https://huggingface.co/bartowski/Qwen2.5-Coder-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-0.5B-Instruct-Q4_K_M.gguf` |
| Mid A/B (1.5B Instruct) — shalom bench, not 0.5B floor | `https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf` |

---

## Patch steps (when operator authorizes — still no push / no routing.mjs)

1. Edit **only** `scripts/fetch-models.mjs` registry entry for `tool-router-agent` (url + description + approxBytes; filename per Option 1 or 2).
2. Update header comment L11 so it no longer says Qwenstral while downloading Coder.
3. Re-fetch into a clean dir; SHA256 the blob; compare to on-disk LocalAI / note9 copies.
4. Run `nexus-eval/score-routes.mjs` on shalom (baseline vs Instruct) before phone push.
5. Pack/agents path updates if filename changes — **separate** from `src/routing.mjs` / PR #12 mutex.

**Out of scope this note:** git push, `routing.mjs` edits, live qodesh deletes of GGUFs.

---

**End FETCH-MODELS-QWENSTRAL-MISMATCH-FIX** · NX-08 draft · box-only

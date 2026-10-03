# Nexus / tool-router model iteration (2026-09-12)

**Operator ask:** iterate models until nexus works **much better** than now. Ongoing loop, not one swap.

**Constraint:** Do **not** push git; do **not** rewrite `src/routing.mjs` (PR #12 mutex). Nexus prompt tweaks = patch notes only (below).

---

## Current baseline (sourced)

| Item | Value |
|------|-------|
| Alias | `tool-router-agent` (NEXUS) |
| Typical weight | `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` (~0.44 GB / **460616064** bytes on live LocalAI per session-handoff) |
| Role | JSON route / tool-router; resident on note9; CPU on qodesh |
| Known risk | `fetch-models.mjs` URL pulls **Qwen2.5-Coder-0.5B** saved under Qwenstral name — dogfood mismatch (exact lines below) |
| Failure modes tied to weak nexus | vision-first hop on plain text; ugly `\|after:vision`; wrong specialist propose; Unicode 500 on router path (see DISPATCH-BUGS #2/#7) |

FIX-01 (unknown→400 / unavailable→pin) is **routing policy**, not model IQ — still required so bad pins don’t look like “nexus answered well.”

---

## 1. Gold-set outline + scoring rubric

**Harness path:** `/workspace/reviews/release/nexus-eval/`

| File | Role |
|------|------|
| `gold-routes.json` | **35** prompts (in 20–40 band): text / code / vision / audio / image-gen / speech / ambiguous / negatives |
| `score-routes.mjs` | Offline scorer — reads recorded JSON routes; **no live GPU** |
| `recorded.sample.jsonl` | Tiny fixture for smoke |
| `score-report.sample.json` | Sample report from smoke |

### Family mix (35 cases)

| Family | IDs | Count | Gold intent |
|--------|-----|------:|-------------|
| text | T01–T08 | 8 | → `general-text-speculator`; vision/audio illegal |
| code | C01–C06 | 6 | → `qwenstral-code-speculator` |
| vision | V01–V03 | 3 | modality=image → `vision-layout-agent` |
| audio | A01–A02 | 2 | modality=audio → `audio-transcription-agent` |
| image-gen | I01–I03 | 3 | text-only “draw/generate” → `image-generation-agent` (DISPATCH #5) |
| speech | S01–S02 | 2 | read aloud → `speech-synthesis-agent` |
| ambiguous | X01–X07 | 7 | no modality → not vision/audio; safety/embed/rerank soft-accept |
| negatives | N01–N04 | 4 | classic vision-first bait (DISPATCH #2) |

### Scoring rubric

| Metric | Definition | Pass bar |
|--------|------------|----------|
| **top1_accuracy** | `got.route === expect_route` / N | **≥ 85%** |
| **accept_accuracy** | `got.route ∈ accept[]` / N (soft set) | track; prefer ≥ 90% |
| **illegal_hop_rate** | propose in `illegal[]` **or** `vision-layout-agent`/`audio-transcription-agent` on `modality:text` **or** `tool-router-agent`/`auto` / N | **&lt; 5%** |
| **json_parse_rate** | parseable minified `{"route","confidence","reason"}` / N | **≥ 95%** |
| **coverage** | every gold `id` present in recorded JSONL | **100%** for a full A/B |

**Latency (live only, not offline scorer):** p50 propose &lt; 2s on shalom CPU 0.5B; phone note9 keep resident usable (historical ~23.8 tok/s tg32). Offline scorer does not measure latency.

**How to record a live run (later, on host):** for each gold case, POST nexus consult / capture raw completion text into `recorded.jsonl` as `{"id":"T01","raw":"<model text>"}`. Then:

```bash
node /workspace/reviews/release/nexus-eval/score-routes.mjs \
  --gold gold-routes.json \
  --recorded recorded.jsonl \
  --out score-report.json
```

---

## 2. fetch-models.mjs — Qwenstral filename vs Coder URL (exact)

**Tip tree inspected:** `/workspace/gh-sync/green-roomz/scripts/fetch-models.mjs` (synced tip `main@eb4a9f7` lineage).

| Location | Content (verbatim) |
|----------|--------------------|
| Header comment L11 | `* 5. Qwenstral-Small-3.1-0.5B (tool-router / code-speculator, ~398 MB)` |
| Registry entry L34–38 | `alias: 'tool-router-agent'` |
| **filename L35** | `'Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf'` |
| **url L36** | `'https://huggingface.co/bartowski/Qwen2.5-Coder-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-0.5B-Instruct-Q4_K_M.gguf'` |
| approxBytes L37 | `398000000` |
| description L38 | `'Tool router & code specialist (0.5B)'` |

**Verified HF:** `bartowski/Qwen2.5-Coder-0.5B-Instruct-GGUF` exists; file `Qwen2.5-Coder-0.5B-Instruct-Q4_K_M.gguf` listed ~0.40 GB (coder instruct, not chat instruct).

**Contrast (same file):** general-text entry L28–29 correctly points chat Instruct:

- filename `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf`
- url `https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf`

**Integrity ask (still open):** SHA-check live qodesh/note9 on-disk `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` (handoff **460616064** bytes) vs (a) tip fetch Coder bytes (~398MB) vs (b) any historical LocalAI “Qwenstral” artifact. Do not invent hashes — measure on host.

---

## 3. Drop-in GGUF candidates (phone vs shalom A/B)

Verified via Hugging Face / bartowski pages (2026-09-12 web). No invented names.

| # | Role | Artifact | Size class | Host | Status |
|---|------|----------|------------|------|--------|
| **A** | Phone floor / integrity swap | `bartowski/Qwen2.5-0.5B-Instruct-GGUF` → `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` | **~0.40 GB** (HF lists 398 MB; SHA256 on HF blob `6eb923e7d26e9cea28811e1a8e852009b21242fb157b26149d3b188f3a8c8653` for current main — re-verify on download) | **note9** phone-min; also qodesh CPU | **VERIFIED** chat instruct (not coder). Same class as current 0.5B. Manifest still uses Qwenstral *filename* — A/B by replacing bytes or adding sidecar path in agents config (operator), not by inventing new alias. |
| **B** | Mid router (primary A/B) | `bartowski/Qwen2.5-1.5B-Instruct-GGUF` → `Qwen2.5-1.5B-Instruct-Q4_K_M.gguf` | **~986 MB / 0.99 GB** (HF SHA256 `1adf0b11065d8ad2e8123ea110d1ec956dab4ab038eab665614adba04b6c3370`) | **shalom** primary bench; optional mid laptop if RAM free | **VERIFIED**. Named in MODEL-PACK-INVENTORY mvp notes. |
| **C** | Alt family mid | `bartowski/Llama-3.2-1B-Instruct-GGUF` → `Llama-3.2-1B-Instruct-Q4_K_M.gguf` | **~0.81 GB** (HF card ~0.81GB / 771–808 MB class) | **shalom** secondary A/B | **VERIFIED** bartowski repo. Chat-template differs (Llama-3 vs Qwen im_start) — confirm llama-server chat format before dogfood. |

**Still TBD (do not claim until measured):**

- Whether historical on-disk `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` (460616064 B) matches any public bartowski file (likely **not** the tip Coder URL).
- Exact sha256 of tip-fetched Coder file after download.
- Phone ARM: optional bartowski `Q4_0_4_4` coder/instruct variants — only if Termux llama build supports; **verify** before shipping to note9.

**Not proposed:** coder-as-router (current tip URL) as the quality target — keep coder weights for `qwenstral-code-speculator`, not nexus.

---

## 4. Minimal offline eval command

```bash
# From box (no GPU):
cd /workspace/reviews/release/nexus-eval
node ./score-routes.mjs \
  --gold ./gold-routes.json \
  --recorded ./recorded.jsonl \
  --out ./score-report.json
```

Smoke already run with `recorded.sample.jsonl` → `score-report.sample.json` (partial coverage by design).

**Recorded format:** one JSON object per line — either pre-parsed `{id,route,confidence,reason}` or `{id,raw:"{...}"}`. Parser mirrors `nexus.mjs` `extractJsonObject` / fence strip (local copy in scorer — does **not** import `src/`).

---

## 5. Nexus.mjs prompt tweaks — patch notes only (do not land here)

PR #12 holds `routing.mjs`. Optional later edits to `src/nexus.mjs` / `policies/tool-router.md` only:

1. **tool-router.md** — add one line: `Never choose vision-layout-agent or audio-transcription-agent unless USER modality requires it; default general-text-speculator.` (kernel already says emit JSON only / never tool-router.)
2. **ALIAS_HINTS** (`nexus.mjs` ~L100–111) — sharpen vision hint to `user attached an image part (required)` and audio to `user attached audio part (required)` so 0.5B sees hard requirement.
3. **buildNexusPrompt** — optional `Constraint:` injection when `modality===text`: `text-only turn: do not pick vision-layout-agent or audio-transcription-agent` (enum filter already omits them from AVAILABLE in tip `nexusCandidateAliases`; live cut-2 may lag — prompt belt + enum suspenders).
4. **Do not** change `routeIsBad` / `|after:` assembly in this iteration loop without Release Driver bounce plan (DISPATCH #2).

---

## Iteration axes (in order)

1. **Integrity** — verify on-disk SHA vs intended artifact (kill coder-masquerading-as-Qwenstral).
2. **Candidate ladder** — A (0.5B Instruct) phone/qodesh → B (1.5B Instruct) shalom → C (Llama-3.2-1B) optional.
3. **Prompt / schema** — patch notes above; JSON schema strictness.
4. **Enum filter** — bounce vision/audio omission for text turns (P0#2 / prettify) so model can’t propose illegal hops.
5. **Eval harness** — gold + offline scorer (this doc §1/§4).

## Host matrix

| Host | Nexus budget | Iterate how |
|------|--------------|-------------|
| note9 | 0.5B only resident | Integrity + candidate **A**; prompt/schema; no 1.5B |
| qodesh | 0.5B CPU slow | Integrity + prompt; offline score from recorded JSON |
| **shalom** | can A/B 0.5B vs 1.5B | **Primary model-iteration bench** — first live A/B |

## Success bar

- Illegal vision/audio propose on plain text **&lt; 5%** on gold set
- Correct specialist top-1 on gold set **≥ 85%**
- No silent wrong-alias→200 tool-router (FIX-01)
- Phone still boots with one resident GGUF

## Immediate next / recommended first A/B

1. **SHA-check** live qodesh/note9 router GGUF vs tip Coder URL bytes vs candidate A Instruct bytes.
2. Run offline scorer once a full `recorded.jsonl` exists for current weights (baseline).
3. **First live A/B host: shalom** — baseline (current Qwenstral-named file) vs candidate **A** (`Qwen2.5-0.5B-Instruct-Q4_K_M`) then vs candidate **B** (`Qwen2.5-1.5B-Instruct-Q4_K_M`). Score with `nexus-eval/score-routes.mjs`. Phone note9 only after A wins integrity + illegal-hop bar on shalom.

**Paths written this pass:**

- `/workspace/reviews/release/NEXUS-MODEL-ITERATION-2026-09-12.md` (this board)
- `/workspace/reviews/release/nexus-eval/gold-routes.json`
- `/workspace/reviews/release/nexus-eval/score-routes.mjs`
- `/workspace/reviews/release/nexus-eval/recorded.sample.jsonl`
- `/workspace/reviews/release/nexus-eval/score-report.sample.json`

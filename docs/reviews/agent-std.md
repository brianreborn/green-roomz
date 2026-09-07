# Standardized agent tests

Not a SOTA bench. A **frozen, verifiable** slice of public eval *styles* against the local OpenAI-compatible gateway.

| | |
|---|---|
| Suite | `eval/agent-std.json` |
| Runner | `scripts/agent-std-eval.cmd` → `scripts/agent-std-eval.mjs` |
| Results | `data/agent-std-last.json` |
| npm | `npm run eval:agent` |

## Families

| Family | Public cousin | What we score |
|---|---|---|
| `openai-schema` | OpenAI chat completions | HTTP shape, `/v1/models` |
| `ifeval` | [IFEval](https://arxiv.org/abs/2311.07911) | Verifiable constraints (exact token, bullets, ALL CAPS) |
| `mt-turn` | MT-Bench turn-2 | Name persist |
| `system-follow` | instruction hierarchy | System suffix |
| `json-mode` | structured output | Parseable object + keys |
| `honesty` | tool/modality honesty | Missing `/draw` is **503**, not a fake picture |

**Out of scope here:** MMLU, GAIA, SWE-bench, tau-bench (need tools + a frontier model).

## Gates

- `protocol` — fail the process if any FAIL (ship gate).
- `quality` — counted; tiny Instruct will miss IFEval. Process still exits 0 unless `GRZ_EVAL_STRICT=1`.

Athlon: `max_tokens` 8–64. Fetch abort is `gateway.agent_chat_timeout_ms` (MVP 60s) or `GRZ_CHAT_TIMEOUT_MS`. Serve must already be up (`scripts\start-windows-mvp.cmd`).

# Changelog

## 1.0.0

OpenAI-compatible disclosure so research clients (OBLITERATUS and others) can
ask the gateway for parameters it already knows.

- `GET /v1/weights` and `GET /v1/models/{alias}/weights` — GGUF path, format, tensor names/shapes/dtypes (no multi-GB bodies).
- `GET /v1/models/{alias}` — `checkpoint_path` / `root`, architecture, `num_layers`, heads, hidden size, context, quantization when the GGUF header is readable.
- `POST /v1/chat/completions` with `logprobs` / `top_logprobs` is accepted (passed through to llama.cpp).
- `general-text` kernel may answer in-band introspection JSON; do not invent geometry.
- Live e2e harness finds repo `runtime/llama-server` + try GGUF, uses a valid 11-alias manifest, `admit_when_tight: page`.

Closes [#20](https://github.com/brianreborn/green-roomz/issues/20), [#21](https://github.com/brianreborn/green-roomz/issues/21), [#22](https://github.com/brianreborn/green-roomz/issues/22), [#23](https://github.com/brianreborn/green-roomz/issues/23).

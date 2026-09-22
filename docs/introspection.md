# Introspection

Two ways to ask what a running alias already knows.

| Path | What it is |
|---|---|
| `GET /v1/models` and `GET /v1/models/{alias}` | Catalog. `checkpoint_path`, architecture, layers, heads, hidden size, context, quantization when the GGUF header is readable. The list leaves per-file `sha256` unset so a catalog scan does not hash multi-GB checkpoints. |
| `GET /v1/weights?model={alias}` and `GET /v1/models/{alias}/weights` | Tensor index: name, shape, dtype, sha256 of the tensor bytes. Not the weight bodies. |
| `GET /v1/weights?include=values&tensor={name}&max_params=4096` | Inline a tiny f32/f16/bf16 tensor. A tensor over `max_params` returns `413` and `checkpoint_path`. |
| `POST /v1/chat/completions` | `logprobs` / `top_logprobs` (OpenAI cap 20 unless `logprobs: "full"` or `obliteratus.uncapped_logprobs`). Full logits only when `obliteratus.logits` is true or `logprobs` is `"full"`. |

A chat turn whose user message is the structured JSON probe (the field names `architecture`, `num_layers`, `checkpoint_path`, and the rest) is answered by the gateway from the registry and the GGUF header. Unknown fields are `null`. The model is not asked to invent layer counts.

That in-band JSON is a **claim**. `GET /v1/models` and `GET /v1/weights` are the source of truth.

Stock prompts allow describing this process's loaded artifact. They do not weaken other refusals.

# Green-Roomz vs ChatGPT / Grok (qodesh beta, 2026-09-07)

Living estimate. **Not** a quality bench. Last battery: `data/mvp-parity-last.json` **7/7 PASS** 08:35–08:39 UTC (`agents.windows-mvp.json` on `127.0.0.1:8080`, health `degraded`).

Two scores:

| Lens | ~% of ChatGPT/Grok | What it means |
|---|---|---|
| **Client contract** | **55–70%** | A generic OpenAI-compatible client can talk to `127.0.0.1:8080` for chat: models list, messages[], stream SSE, abort, system role. |
| **Product** (smart, fast, multimodal, tools) | **12–20%** | Warm generic chat hits Instruct in ~11s (`chat_default`), not 107s nexus junk. Still 0.5B wording; no vision/image/TTS/code-7B/tools/web. |

No upward revision this pass: C **17198 ms** (was 17258), D **91175 ms** (was 91907, still no literal Ada), E **80632 ms** (was 68637, slower), G **90350 ms** (was 84272, still wording garbage). Unslashed `model=` can still `resident_fallback` to nexus.

Frontier Grok/ChatGPT is not the right quality bar for this box. The honest bar is: “does Continue / curl / llama.app feel like a small ChatGPT?” — **protocol yes, brain no**.

## Surface (what a ChatGPT-like client needs)

| Feature | ChatGPT / Grok | GRZ qodesh tonight | Gap |
|---|---|---|---|
| `GET /v1/models` | many | 11 aliases listed; most **unavailable** | health `degraded` |
| Chat completions | yes | yes, Instruct 0.5B | ~17s one-shot (case C, 17198 ms, `parity-ok`) |
| Multi-turn `messages` | strong memory | HTTP ok; 0.5B did **not** recall “Ada” (case D soft pass, 91175 ms) | quality |
| `stream: true` SSE | yes | yes (51 data lines, case E, 80632 ms) | slow |
| Stop / abort | server cancel | client kill only (case F, 841 ms) | no server ACK |
| System prompt | yes | HTTP 200; wording garbage (case G, 90350 ms) | quality |
| Model picker | real models | slash `/code` `/text` `/auto`; `model=` ignored unless `lock_alias` | llama.app last-alias is now nexus (good) |
| `/draw` `/imagine` `/tts` | generate | **503** missing specialist (honest) | need piper/sd |
| `/code` | strong | 7B impractical; **200 on 0.5B router** | weak code |
| Vision / audio in | yes | 400 without part; no live backends | missing |
| Tools / browsing | yes | no | missing |
| Image out | yes | 503 | missing |
| Voice | yes | 503 | missing |
| Speed | 50–100+ tok/s | **~3 tok/s** (meas) | ~20–40× slow |
| Context | 128k–1M | llama `--ctx-size` 4096 | small |

## Quality sample (curl tonight)

Unslashed POST `model=general-text-speculator` “Say hello in one short sentence.” → HTTP 200 in **107416 ms**, `route-reason=resident_fallback`, effective alias `tool-router-agent`:

> ] **[]{# How can I get help? #> [tool-router-agent](#how-can-i-get-help] []\\]# What about my aliases?

`lock_alias: true` on the same prompt → HTTP 200 in **3006 ms**, effective alias `general-text-speculator`:

> "Hello there!"

A generic ChatGPT-like client does not send `lock_alias`, so it can get the nexus ramble.

## Why it feels unlike ChatGPT even when HTTP is 200

Parity **passes on transport**. Replies in D/G are 0.5B ramble (`ack`, tool-router names, checklists). A user comparing to Grok will say it does not work, while the battery says PASS.

TTFB on unslashed turns can include nexus consult (MVP cap **10s** now, was 25s) or **resident_fallback** onto the 0.5B router. Cold mmap of Instruct adds more. That is the hot path, not the old 50 ms pad (`timing_privacy: off`).

## Closest path to “operates as well as” *on this PC*

Without new downloads (beta tonight):

1. Serve up on `agents.windows-mvp.json` with tonight’s tree (503, lock_alias, silent-defaults, race C1/H3/L3).
2. Re-run `scripts\mvp-parity-battery.cmd` — still a **surface** score.
3. Dogfood `scripts\chat-mvp.cmd` and slash `/text` `/auto`. Expect slow, small-model chat. Pin with `lock_alias` if the client can.
4. Keep missing specialists as **503**, not fake ChatGPT.

To move the **product** score (not tonight, needs RAM/models): 1.5B Instruct if free RAM allows; real `/code`; piper; optional Note 9 Termux worker. Still not frontier Grok.

## E2E app loop (languages as needed)

`green-roomz agent --goal "..." [--workspace dir] [--offline] [--lang py]` writes, runs, **tests**, and feeds compiler/runtime errors back. Language comes from the goal, `--lang`, or file extension. Unknown extensions can be registered (`runtime` tool) against an allowlisted bin on PATH — that is how it learns a language mid-session. Missing toolchains (Go/Rust/C on qodesh) return 127, they are not downloaded.

Answers (agent + live eval) are budgeted at **60s**, not 3–5 minutes. `gateway.agent_chat_timeout_ms` is **60000**. Default eval is smoke + fail-fast + offline (seconds). One live gateway hit: `npm run eval:e2e:live`. Full 16 offline: `npm run eval:e2e:full`.

```
npm run test:agent
npm run eval:e2e
npm run eval:e2e:live
```

## Refresh

Update this file whenever the battery re-runs. `overall` + case D/G wording + tok/s are the three numbers that change the %.

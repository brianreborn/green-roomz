# Known bugs (2026-08-28)

Live on shalom `green-roomz serve` unless noted. Avoid with slash commands until prettify lands.

## Routing / nexus (open)

- **Vision-first hop.** Qwenstral 0.5B still emits `vision-layout-agent` on plain text. Gateway rejects (`vision without image part`) then falls through. `/route` aliases can be right while `x-green-roomz-route-reason` looks like `default_text|after:vision without image part`.
  - Avoid: `/text`, `/code`, `/image`, or `/auto` every turn. Do not trust unaided “draw/generate an image”.
  - Fix (not landed): omit vision/audio from nexus AVAILABLE + `json_schema` enum unless `detectModalities` has that part; map text-only draw/imagine/generate-an-image to `image-generation-agent` in `offlinePlan`; return only the final reason.

- **Text-only image intent goes to general-text.** “A red apple” / “draw a red apple” without `/image` does not reach `image-generation-agent`.
  - Avoid: `/image`, `/imagine`, or `/draw`.

- **llama.app last-alias pin.** Client keeps sending `model=general-text-speculator`. `/auto` now unlocks pin and session (tested). A plain follow-up with no `/auto` after `/code` is not fully proven on the chat path.
  - Avoid: `/auto` or an explicit slash each turn. `lock_alias: true` only when you mean lock.

- **`/vision` with no image** slash-locks `vision-layout-agent`, then the specialist has nothing to see.
  - Avoid: attach a real image part, or do not use `/vision`.

- **`/embed` `/rerank` `/tts` `/audio` on `/v1/chat/completions`** likely 400 / wrong endpoint. Unverified live.
  - Avoid: use their native routes (`/v1/embeddings`, `/v1/rerank`, audio/tts hosts) until chat-path is wired.

- **`/router`** maps to `tool-router-agent`, which `routeIsBad` treats as not user-visible. May work on `/route` and fail on chat hops. Unverified.

- **Mixed image + audio** still `ValidationError`.
  - Avoid: one modality per turn, or an explicit qualified workflow.

- **qodesh tree lag.** qodesh was unpacked from an older `green-roomz.tar` and may lack slash `/auto` / sanitizer patches until `src/*.mjs` is copied from shalom or `/workspace/grz-src`.

## Escape / embed (partially patched on shalom)

Landed on shalom both trees: C0/C1/ESC/CRLF stripped from route reason/headers/hop notes; route + HANDOFF `suggest` allowlisted; USER fenced so it cannot spoof AVAILABLE/HANDOFF; first `{...}` JSON only; slash ignored inside fences.

Still open:

- Stream path can forward **raw SSE bytes** (ANSI / OSC 52 / CSI) to llama.app.
- Client headers are still forwarded to llama-server except a small denylist.
- `sanitizeCompletionJson` only strips reasoning fields, not C0/C1/ESC in content.
- Do not dump raw nexus/model text onto the qodesh `thinking.log` console without stripping ESC.

## Serve / ops

- qodesh `:8080` is **degraded** without Qwen3-4B; nexus `:8187` 0.5B CPU-only is the working piece.
- HTTP `192.168.1.251:8765` must stay bound to LAN (not 127.0.0.1). Duplicate python listeners caused 404/335-byte fake GGUFs.
- Grok Bot local-exec on both PCs can drop mid-command; reconnect and continue. Do not Shell two `machineId`s in one parent turn.
- McAfee on shalom: no Add-Type/P/Invoke; long PowerShell here-strings abort; do not disable RTS.
- CUDA 6.5 installer is **on disk only** (`C:\LocalAI\_tmp\cuda_6.5.19_windows_general_64.exe`, md5 `63575eee9cb5cbf3e84f9c4496060399`). Do not run it on Win11/8600 (driver risk). 224MB VRAM cannot hold 0.5B Q4.

## Known limitations: file drop vs agent switch

- **Gateway does not require an explicit agent switch** to accept a drop that arrives as a real multimodal part. `hardRuleRoute`: audio part -> `audio-transcription-agent`; image part -> `vision-layout-agent`. Those beat slash and the llama.app pin.
- **You do need `/image` (or `/imagine` `/draw`)** for *generating* a picture from text. Dropping an image is look-at-this (vision), not image-gen.
- **llama.app / unicorn UI was not verified.** Many clients hide the attach/drop control unless the selected model is vision or audio. If drop is greyed or rejects types, switch with `/vision` or `/audio` first, then drop. That is a client limitation, not a gateway one.
- Drop UI accept-list / disable-during-generate was **not patched** this session. If almost every file type still will not drop, it is still the client.
- Mixed image+audio in one request still `ValidationError`.
- Unicorn script on shalom HTTP listing: `C:\LocalAI\green-unicorn.py` (unread this wrap).

## Working around routing today

```
/code   C++ / programming
/text   chat, poems, translation
/image  generate a picture
/auto   run nexus, ignore client pin
/vision only with an attached image
```

`POST /v1/chat/completions/route` with `model` pinned still reports `x-green-roomz-effective-alias` and `x-green-roomz-route-reason`.

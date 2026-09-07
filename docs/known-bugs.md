# Known bugs (2026-08-28)

Live on shalom `green-roomz serve` unless noted. Bounce serve after this landing.

## Routing / nexus

- **Vision-first hop (mitigated).** Nexus AVAILABLE + `json_schema` omit `vision-layout-agent` / `audio-transcription-agent` unless that part is present. A live 0.5B that still emits vision is rejected and the **final** reason is returned (no `after:vision without image part`).
- **Text-only image intent.** `draw a red apple` / `imagine a sunset` / `generate an image` map to `image-generation-agent` via `offlinePlan`. A bare noun like “a red apple” still goes to general-text.
- **llama.app last-alias pin.** Client `model=` is ignored unless `lock_alias: true`. A plain follow-up after `/code` consults nexus (tested). `/auto` also unlocks. `lock_alias: true` only when you mean lock.
- **`/vision` / `/audio` without that part** → **400** (`/vision requires an attached image part`).
- **`/embed` `/rerank` on chat** rewrite to `/v1/embeddings` and `/v1/rerank`, wrap the native JSON as a chat.completion. `/rerank` body: query line, then one document per line.
- **Missing native slash** (`/draw` `/imagine` `/image` `/tts` `/speak` `/embed` `/rerank`, and `model:` of those aliases) → **503** when the specialist cannot admit. Empty `/tts` text is still **400**. `/code` on an impractical specialist still **200** resident 0.5B.
- **`/router`** pins the resident 0.5B (`slash_router`), does not hop as a user-visible specialist.
- **Mixed image + audio** no longer `ValidationError`; both stay in nexus AVAILABLE unless `/vision` or `/audio` is explicit.
- **qodesh specialists.** 7B code is `impractical` on 16GB. `/code` no longer 503s: skip to an admittable alias or the resident 0.5B. Whisper/Piper/sd-server binaries may still be missing.

## Escape / embed (partially patched on shalom)

Landed on shalom both trees: C0/C1/ESC/CRLF stripped from route reason/headers/hop notes; route + HANDOFF `suggest` allowlisted; USER fenced so it cannot spoof AVAILABLE/HANDOFF; first `{...}` JSON only; slash ignored inside fences.

Still open:

- JSON completions strip C0/C1/ESC from `message.content` / `delta.content`. Stream tails after HANDOFF peek are parsed and sanitized the same way (no raw SSE byte-forward).
- Upstream hops allowlist `content-type` / `accept` / `idempotency-key` only.
- Do not dump raw nexus/model text onto the qodesh `thinking.log` console without stripping ESC.

## Serve / ops

- qodesh `:8080` is **degraded** without Qwen3-4B; nexus `:8187` 0.5B CPU-only is the working piece.
- HTTP `192.168.1.251:8765` must stay bound to LAN (not 127.0.0.1). Duplicate python listeners caused 404/335-byte fake GGUFs.
- Grok Bot local-exec on both PCs can drop mid-command; reconnect and continue. Do not Shell two `machineId`s in one parent turn.
- McAfee on shalom: no Add-Type/P/Invoke; long PowerShell here-strings abort; do not disable RTS.
- **Note 9 Termux cannot exec `/data/local/tmp`.** SELinux `untrusted_app`. Copy llama pack to `~/grz-runtime`. `/sdcard` is noexec; needs `termux-setup-storage` to read `Download/`.
- **Phone RAM headroom.** 2 GiB floor blocked 0.5B nexus on ~3 GiB free. `headroomBytes()` is 256 MiB when `totalmem < 8 GiB`.
- CUDA 6.5 installer is **on disk only** (`C:\LocalAI\_tmp\cuda_6.5.19_windows_general_64.exe`, md5 `63575eee9cb5cbf3e84f9c4496060399`). Do not run it on Win11/8600 (driver risk). 224MB VRAM cannot hold 0.5B Q4.

## Known limitations: file drop vs agent switch

- **Gateway does not require an explicit agent switch** to accept a drop that arrives as a real multimodal part. `hardRuleRoute`: audio part -> `audio-transcription-agent`; image part -> `vision-layout-agent`. Those beat slash and the llama.app pin.
- **You do need `/image` (or `/imagine` `/draw`)** for *generating* a picture from text. Dropping an image is look-at-this (vision), not image-gen.
- **llama.app / unicorn UI was not verified.** Many clients hide the attach/drop control unless the selected model is vision or audio. If drop is greyed or rejects types, switch with `/vision` or `/audio` first, then drop. That is a client limitation, not a gateway one.
- Drop UI accept-list / disable-during-generate was **not patched** this session. If almost every file type still will not drop, it is still the client.
- Mixed image+audio in one request goes to nexus (both parts in AVAILABLE) unless `/vision` or `/audio` is explicit.
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

# Routing prettify backlog 2026-08-28
Parent stack should keep this and apply even if the background worker only does part.

## Confirmed
- 8/8 aliases: cpp->code, limerick/apple/auto->general-text, /code /text /image slash, /auto unlocks pin even after /code
- Traps already in: ESC/CRLF strip, HANDOFF suggest allowlist, USER fence, first JSON only, slash ignored in fences

## Ugly (fix)
1. 0.5B still picks vision-layout-agent first; we reject. Reasons contain `after:vision without image part`.
   Fix: omit vision/audio from AVAILABLE + json_schema enum unless detectModalities has that part.
2. Text-only "draw/generate image" falls to general-text. Should be image-generation-agent via offlinePlan.
3. Reason should be the FINAL decision only (code_intent, default_text, slash_*, nexus) not the failed hop.

## Unrun / likely next bugs
- /embed /rerank /tts /audio on chat completions may 400 (wrong endpoint)
- /router vs "nexus not user-visible"
- /vision with no image locks a blind specialist
- session affinity without /auto after /code
- qodesh tree is old tar, diverges from shalom
- stream path still forwards raw SSE (ANSI/OSC)

## CUDA 6.5 (parallel, not routing)
- shalom: C:\LocalAI\_tmp\cuda_6.5.19_windows_general_64.exe 1053974928 bytes md5 63575eee9cb5cbf3e84f9c4496060399
- LAN: http://192.168.1.251:8765/_tmp/cuda_6.5.19_windows_general_64.exe
- do not install (Win11 + 8600 driver)

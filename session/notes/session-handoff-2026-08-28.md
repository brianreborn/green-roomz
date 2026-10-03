# Green-Roomz session handoff 2026-08-28 (PT)

Pickup file for the next turn. Local-exec dropped workers mid-edit. Do not re-download CUDA 6.5 on shalom (already hashed). Grok CLI: grok-4.6 reasoning **low**.

## Machines
- shalom 801f51e6-fe6a-4bad-b878-e4aa3de1127c — Ryzen 5 7520U, Vulkan APU, live GRZ
- qodesh 19f2c19e-e100-49f0-8507-813d66727973 — Athlon II X2, 8600 GT 224MB sm_1.1, 16GB DDR3
- Do not Shell both machineIds in the same parent turn (target-change abort).
- Local-exec can vanish mid-command; treat as crash, reconnect, continue.

## Shalom live GRZ (DONE enough to use)
- Git: C:\Users\brian\Documents\green-roomz
- Live serve cwd: C:\Users\brian\Documents\Codex\2026-08-28\files-pasted-by-the-user-1\outputs\green-roomz
- Serve http://127.0.0.1:8080  nexus :8187 CPU 0.5B resident
- llama-server: C:\LocalAI\llama-b10665-bin-win-vulkan-x64\llama-server.exe
- Models: C:\LocalAI  HTTP file server 192.168.1.251:8765 (keep alive; python eagle3-venv bind 192.168.1.251 cwd C:\LocalAI)
- Patched both trees: slash map, /auto unlocks client pin+session, vision-without-image / audio-without-audio rejected, json_schema, ESC/CRLF strip on reasons, HANDOFF suggest allowlist, USER fenced, first JSON only, slash ignored in fences
- Last /route 8/8 aliases (pinned general-text-speculator):
  1 cpp -> qwenstral-code-speculator
  2 limerick -> general-text-speculator
  3 apple-text -> general-text-speculator
  4 /code slash_code
  5 /text slash_text
  6 /image slash_image
  7 /auto limerick -> general-text (unlock)
  8 /auto after /code -> general-text (session unlock)
- Reasons still ugly: `after:vision without image part` because 0.5B still picks vision first; we reject. **Prettify worker DID NOT PATCH** (disconnect).
- GitHub https://github.com/brianreborn/green-roomz private. No commit/push this session unless asked.

## How users avoid broken routing (until prettify)
- Slash every turn: /code /text /image /auto (also /cpp /chat /imagine /draw /tts /speak /vision /audio /embed /rerank /router /guard)
- /auto skips llama.app last-alias pin
- Plain "draw/generate an image" will NOT hit image-generation-agent (falls to general-text)
- Do not /vision without a real image part
- /embed /rerank /tts /audio on /v1/chat/completions likely wrong endpoint
- /router may collide with "nexus is not a user-visible target"
- Mixed image+audio still throws ValidationError

## Prettify (NOT landed) — do this next on BOTH shalom trees, bounce from Codex cwd
1. Omit vision-layout-agent from AVAILABLE + json_schema enum unless detectModalities.image
2. Omit audio-transcription-agent unless .audio
3. offlinePlan: text-only draw/imagine/generate-an-image -> image-generation-agent
4. Returned reason = FINAL decision only (no after:vision without image part)
5. Retest 8 cases + "draw a red apple" -> image-generation-agent
6. Then live-test remaining slash: /embed /rerank /router /guard /tts /audio /vision
Patched copies on the BOX (may include /auto+sanitizer, not prettify):
  /workspace/grz-src/{gateway,handoff,nexus,routing,util}.mjs
Copy onto qodesh too: C:\Users\brian\Documents\green-roomz\src\

## Qodesh GRZ (smoke up, not feature-parity)
- Node v24.19.0  C:\Program Files\nodejs\node.exe  (PATH may need prepend in agent shells)
- Git yes. Tree: C:\Users\brian\Documents\green-roomz from tar (OLD, no slash/prettify)
- bin\green-roomz.mjs present
- llama: C:\LocalAI\llama-b10665-bin-win-vulkan-x64\llama-server.exe
- 0.5B: C:\LocalAI\Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf 460616064
- tar 26064384, llama zip 34476938 — do not re-download
- Serve was started: :8080 degraded (no 4B), nexus :8187 ok, CPU --device none
- Thinking log: C:\LocalAI\thinking.log  (one maximized Get-Content -Wait window; do NOT spawn more)
- logline helper intended: C:\Users\brian\Documents\green-roomz\scripts\logline.ps1
- Must-have leftover: copy /workspace/grz-src/*.mjs onto qodesh src, bounce serve, confirm /health
- Fake 335-byte GGUFs were 404 HTML; never treat <10KB as models
- No CUDA 1.x port started. 0.5B does not fit 224MB VRAM.

## CUDA 6.5 (hypothetical sm_1.1 / 8600 GT) — NOT installed
- Shalom HAS installer: C:\LocalAI\_tmp\cuda_6.5.19_windows_general_64.exe
  bytes 1053974928  md5 63575eee9cb5cbf3e84f9c4496060399
  URL https://developer.download.nvidia.com/compute/cuda/6_5/rel/installers/cuda_6.5.19_windows_general_64.exe
- LAN: http://192.168.1.251:8765/_tmp/cuda_6.5.19_windows_general_64.exe
- Do NOT run installer (Win11 + 8600 driver risk). Do NOT replace NVIDIA driver.
- qodesh: git yes; Python/CMake/Ninja were MISSING; winget was in-flight (first --id style failed). VS2013 (needed for CUDA 6.5 nvcc) NOT installed. vswhere missing. Do not install VS2022 as a fake.
- qodesh CUDA WAN curl may have a partial file; prefer LAN copy from shalom and verify md5.

## Web unicorn / file drop (NOT verified)
- C:\LocalAI\green-unicorn.py listed on shalom HTTP earlier; not inspected this wrap.
- Need: drop accept all GRZ types at ANY time (png/jpg/webp/wav/mp3/gguf/etc), no disable-during-generate, no mixed-modality hard fail if that blocks drops.
- Gateway still rejects mixed image+audio.

## Operator traps
- No Add-Type / P/Invoke on shalom (McAfee). Short PowerShell; long here-strings abort.
- CopyFromBox refuses C:\LocalAI\... as dest sometimes; use Documents\green-roomz
- Don't kill 8765 python when bouncing :8080
- Don't Stop-Process node casually (McAfee)
- Don't scrape shalom Task Manager onto the assistant console
- Don't git commit unless asked
- Grok: no login/SuperGrok. Effort currently **low** (~/.grok/config.toml)

## Next-session order
1. qodesh: copy patched src from box, bounce serve, /health
2. qodesh: LAN-pull CUDA 6.5 installer, cmake/ninja/python via winget (no install of toolkit)
3. shalom: prettify nexus (vision/audio enum filter + image-gen offlinePlan + clean reasons), bounce, 9-line /route
4. unicorn drop types any-time
5. remaining slash live tests

# Green-Roomz model-fetch / placeholder-swap boundary review

Date: 2026-09-06. Tree: `/workspace/green-roomz` (pack mirror `/workspace/e2e-fresh/green-roomz`). Operator wave: missing-model fetch (HF downloads, `${}` model paths, swap `missing-*.gguf` for real files). No push. No exploit steps.

Scope: trust boundaries only — HF download helpers, `${}` expansion into model/command paths, symlink escape on placeholder swap, zip/tar slip on runtime bins. Not races/liveness. Not covert timing.

Attackers:

- **O** — local operator / env override (`GRZ_TINY_*`, hostile plant under `models/` / `runtime/`)
- **N** — network MITM or swapped GitHub/HF asset
- **A** — hostile archive member (`..`, absolute, symlink) inside a release zip/tar

---

## Inventory (current placeholders)

| Manifest | Placeholder / real |
|---|---|
| `config/agents.cursor.json` | `missing-vision.gguf`, `missing-whisper.bin`, `missing-qwen-instruct.gguf` (code + general-text), `missing-embed.gguf`, `missing-rerank.gguf`, `missing-guard.gguf`, `missing-voice.onnx`, `missing-sd.gguf`; runtimes `missing-whisper-server`, `missing-piper`, `missing-sd-server`. Nexus: real `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf`. |
| `config/agents.windows-mvp.json` | Same missings for cold aliases; **general-text** → real `models/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` (HF bartowski URL in metadata). Nexus: Qwenstral. |
| Live `models/` | Only `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` in git and e2e-fresh. Instruct GGUF not present on this box. |

Fetch helpers: `scripts/fetch-tiny-instruct.cmd` (HF → `models\`), `data/download-qwen3-4b.ps1` (HF → `C:\LocalAI\…`, pinned), pack `start.cmd` / `install-windows.cmd` (GitHub llama CPU zip → `runtime\`), `deploy-android.sh` (GitHub android tar → stage then adb).

Termux already uses `ln -sf` for the nexus GGUF (`termux-start.sh:42`; `scripts/note9-termux-setup.sh:50`).

---

## High

### MF1. `GRZ_TINY_FILE` / `GRZ_TINY_URL` are unsanitized env overrides

- **file:** `scripts/fetch-tiny-instruct.cmd:13-18`, `:37`, `:58`
- **attacker:** O (or anything that can set env for the cmd)
- **impact:** `OUT=%GRZ_ROOT%\models\%GRZ_TINY_FILE%` with no basename allowlist. A value with `..\` writes the curl body **outside** `models\` (and still passes the ≥100MB size gate). `GRZ_TINY_URL` is any URL; `curl -L` follows redirects with no host allowlist (HF open-redirect / MITM lands a large blob at `OUT`). No SHA-256 pin (contrast `data/download-qwen3-4b.ps1:4-5`).
- **fix:** Force `GRZ_TINY_FILE` to a single basename matching `^[A-Za-z0-9._-]+\.gguf$`. Resolve `OUT` and require it stays under `%GRZ_ROOT%\models`. Allowlist URL host `huggingface.co` (or pin the default URL only — refuse overrides). Pin SHA-256 + exact size like the Qwen3-4B script. Refuse to overwrite via symlink (`if exist` should not follow a link out of tree — use non-following checks on Windows).

### MF2. Runtime zip/tar extract is unpinned and not confined (zip slip)

- **file:** `start.cmd:24-39`; `install-windows.cmd:118-132`; `deploy-android.sh:32-46`
- **attacker:** N (swapped release asset / MITM) or A (hostile archive)
- **impact:** `curl -L` then `tar -xf … -C runtime\` with **no** SHA-256 of the zip. Archive members with `..` or absolute paths can write outside `runtime\`. Nested-folder fallback `copy /y %%D\*.dll` copies every DLL from the first folder that contains `llama-server.exe` — a planted `..\..\…` member or a sibling DLL is trusted. Android path extracts to a temp dir (better) then `find -name llama-server | head -1` — first match wins; no digest; `cp -a` of `*.so` from the whole extract tree.
- **fix:** Pin SHA-256 of `llama-b10702-bin-win-cpu-x64.zip` and the android tar (publish beside the URL). Extract to a fresh empty temp dir; refuse members that are absolute, contain `..`, or are symlinks; copy **only** allowlisted names (`llama-server.exe`, known DLL/SO list) into `runtime\` / push staging. Same for install-windows pack zip expand (`install-windows.cmd:39,48`).

### MF3. Placeholder swap via symlink is followed as “model present”

- **file:** `src/util.mjs:17-24` (`access` follows links); `src/registry.mjs:34-37`; `src/process-manager.mjs` spawn/`--model` argv; Termux `ln -sf` at `termux-start.sh:42`
- **attacker:** O (plant `models/missing-qwen-instruct.gguf` → symlink outside pack) or A (symlink member surviving extract)
- **impact:** Operator docs push fetch into a **different** filename (`Qwen2.5-0.5B-Instruct-Q4_K_M.gguf`) while cursor/code aliases still point at `missing-qwen-instruct.gguf`. The natural swap is rename **or symlink**. `fileExists` uses `access()`, which follows symlinks, so a link to any readable path marks the alias cold→callable and llama mmaps that target. No `realpath` / “must stay under `models/`” check after resolve. Same for `runtime/missing-*` binaries replaced by links.
- **fix:** After resolve, `realpath` (or `lstat` + reject symlink) and require the final path under pack `models/` or `runtime/`. Prefer copy/rename over symlink for placeholder swap; if symlink is kept for Termux space, allowlist link targets under `$RT/models` only. Do not treat a dangling or out-of-tree link as present.

---

## Medium

### MF4. `${}` allowlist fixed for commands; model paths still lack containment

- **file:** `src/util.mjs:32-50`, `:60-64`; `src/config.mjs:109-126`, `:148-166`
- **attacker:** O / hostile manifest
- **impact:** Expand is now allowlisted (`GRZ_ROOT`,`GRZ_EXE`,`HOME`,`GRZ_LLAMA`) with `Object.hasOwn` — **OK vs old B14 prototype bleed**. `assertRuntimeCommands` fail-closes empty / unresolved / collapsed `/runtime/llama-server` — **OK for commands**. Absolute / UNC / `C:\` candidates still pass through `resolveManifestPath` unchanged; no “must stay under pack root” for `model` / `draft_model` / `projector`. A fetched path written as an absolute string in the manifest (or a planted absolute after expand) is honored. Empty model after expand is not asserted the same way as commands.
- **fix:** After expand+resolve, `realpath` and require under `packageRoot()/models` (or `policies/` for kernels). Fail closed if `model` expands empty. Keep command assert; mirror it for artifact fields.

### MF5. HF fetch has no integrity on the MVP path; Qwen3 script is pinned but off-tree

- **file:** `scripts/fetch-tiny-instruct.cmd:49-56` (size ≥ 100MB only); `data/download-qwen3-4b.ps1:4-5,61-68` (size + SHA-256 — **OK pattern**); `config/agents.windows-mvp.json` metadata URL ~245-249
- **attacker:** N
- **impact:** MVP instruct fetch accepts any ≥100MB body. The better-pinned Qwen3-4B helper writes to `C:\LocalAI\…` (outside pack `models\`) and hardcodes operator Documents paths for logs — not the pack layout. Manifest metadata URL is documentation only; serve does not fetch it.
- **fix:** Port the Qwen3 pin pattern into `fetch-tiny-instruct.cmd` (exact size + sha256 of bartowski Q4_K_M). Dest stays under `%GRZ_ROOT%\models`. Do not teach operators to drop GGUFs in `C:\LocalAI` for the pack path.

### MF6. Manifest retarget vs filename mismatch invites unsafe swap

- **file:** `docs/windows-mvp-aliases.md:11-12,25`; `start.cmd:66-69`; `config/agents.cursor.json:124,191` vs `agents.windows-mvp.json:190`
- **attacker:** O (confused deputy to self)
- **impact:** Fetch writes `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf`. Cursor aliases still want `missing-qwen-instruct.gguf`. Windows-mvp retargets general-text correctly; cursor code/text stay on the placeholder. Operators who “make it work” with `mklink` / `ln -s` hit MF3. No helper that atomically replaces the placeholder with a verified file under the expected name.
- **fix:** One helper: download → verify hash → write to the **manifest basename** (or rewrite the one alias field to the verified name in a local overlay). Document “no symlinks for GGUF swap.” Keep cursor degraded until that helper runs.

---

## Low

### MF7. Android `find … llama-server | head -1` trusts first match

- **file:** `deploy-android.sh:36-46`
- **attacker:** A (extra file named `llama-server` earlier in walk order)
- **impact:** Staging dir limits blast radius vs in-place `tar -C runtime`, but the chosen binary is not path-constrained to an expected relative layout. `.so` copy is broad (`find` whole extract).
- **fix:** Require a known relative path (e.g. `bin/llama-server`) or match digest after extract. Copy only allowlisted `.so` names.

### MF8. Partial download left as attack surface if move fails

- **file:** `scripts/fetch-tiny-instruct.cmd:18,58-61`
- **attacker:** O / disk full
- **impact:** `.partial` is deleted on curl fail and size fail; on `move` fail it may remain. Low.
- **fix:** `del` partial in all failure exits; write under a per-run temp dir under `models\.tmp\`.

---

## OK (do not re-litigate)

- `${}` expand allowlist + `Object.hasOwn` + no prototype `${constructor}` (post-P0/PF).
- Runtime command fail-closed on empty / unresolved / collapsed `/runtime/llama-server` (`config.mjs:109-126`).
- `withDefaultGrzEnv` sets `GRZ_ROOT` to package root when unset (`config.mjs:96-106`).
- Pack `start.cmd` / serve pin `--host 127.0.0.1`; CPU-only messaging; no vulkan LocalAI fallback in current `start.cmd` fetch path.
- `download-qwen3-4b.ps1` size + SHA-256 verify-before-keep is the right integrity pattern (dest location is wrong for pack).
- Gateway still does not download models over HTTP; fetch is launcher/operator only.
- HTTP 8080 cannot change `--manifest` or drive expand (unchanged from boundary B14 scope).

---

## Fix order for the fetch wave

1. **MF1 + MF5:** basename + host allowlist + SHA-256 on `fetch-tiny-instruct.cmd`; dest under `models\` only.
2. **MF2:** pin llama CPU zip / android tar digests; confined extract + allowlisted copy into `runtime\`.
3. **MF3 + MF6:** realpath-under-pack for model/command; helper writes the manifest basename (no symlink swap).
4. **MF4:** confine `resolveManifestPath` results for artifacts (mirror command assert).
5. **MF7/MF8:** android first-match + partial cleanup.

Compose with prior **B14/B15/B17** and platform **PLAT-P1/PF2** — do not fork a second expand story. Tree stays unpatched from this board; Researcher integrates.


---

## Recheck deltas (source confirm, same turn)

Trees: `src/util.mjs` / `src/config.mjs` match between git and e2e-fresh. Live pack **lacks** `scripts/fetch-tiny-instruct.cmd` and `data/download-qwen3-4b.ps1` (source-only today); pack `start.cmd` still auto-fetches the CPU zip.

### Added / strengthened

| ID | Delta |
|---|---|
| **MF2** | Also `install-windows.cmd:35-50` — `tar -xf` of sibling `green-roomz.zip` / `green-roomz-slim.zip` into `%TEMP%\grz-unpack-*` then robocopy into `%LOCALAPPDATA%\Green-Roomz` with no member checks. Same zip-slip class as the llama CPU zip. |
| **MF9** | LAN pull helpers `scripts/pull-localai-from-shalom.ps1` / `scripts/copy-localai-to-d.ps1` robocopy `*.gguf` + runtime into `C:\LocalAI` / `D:\LocalAI` with **no** digest. Feeds `agents.windows.json` absolute paths. Severity Low–Medium (host-overlay, not pack start). Fix: optional digest manifest; restrict source host. |
| **Inventory** | `agents.windows.json` (git only): **no** `missing-*` — all `C:\LocalAI\...`. Android/note9: `${HOME}/grz-runtime/missing/<name>` directory style (`whisper-server`, `piper`, `sd-server`, `vision.gguf`, `whisper.bin`, `code.gguf`, `text.gguf`, `embed.gguf`, `rerank.gguf`, `guard.gguf`, `voice.onnx`, `sd.gguf`). |
| **MF6 demo** | Relative `../../tmp/evil.gguf` via `resolveManifestPath` resolves outside pack (`path.resolve(dirname(manifest),'..', candidate)`). Confirmed class, not a new hole. |

### Still OK

Allowlist expand; `assertRuntimeCommands` fail-closed; `spawn({shell:false})`; `start.sh` does not auto-download; missing artifacts stay `unavailable` (no auto-create); Qwen3-4B script remains the integrity template.

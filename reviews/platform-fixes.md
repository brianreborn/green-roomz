# Green-Roomz platform fix pack

Date: 2026-09-03. Finder: `/workspace/reviews/platform-review.md`. Pass-2/3: `/workspace/reviews/platform-pass2.md`. Integrate: `/workspace/reviews/integrate-refinement.md`.
Tree frozen for security P0 (`src/` is Researcher). This pack is the **next cut** (beta-0.3 / after P0), not that src cut. Copy pack launchers from e2e-fresh into git as PF1/PF3/PF6 when that cut runs.

Path, process lifetime, installer seams, localization. No exploit PoCs. No Knox. No reboot-class verbs. No API-key product (F-B1 is P2). Delta-fold only into RF4 port-free plus launcher pidfile/port-reap. Do not fork waitForReady.

Live lock: do not run pack stop.sh against 127.0.0.1:8080 during integrate (PLAT-S1 would miss :8184 and kill the e2e gateway).

---

## Apply order

1. **PF1** owned-port stop + pidfile (PLAT-S1, PLAT-S2, LIVE-SUSPEND launcher half)
2. **PF2 remainder** percent-VAR / NFC-later / default GRZ_ROOT (PLAT-P1 leftover). Allowlist+fail-closed command path is **B14 this P0** — do not reimplement.
3. **PF3** portable cursor manifest in git; default manifest not windows.json (PLAT-P2, PLAT-I3)
4. **PF4** host binary selection + merge loader paths + spawn cwd (PLAT-I1, PLAT-P5)
5. **PF5** Termux artifacts under HOME (PLAT-P3, PLAT-S3)
6. **PF6** Windows CPU-only start/install (PLAT-I2, PLAT-I4)
7. **PF7** SIGHUP, no fake SIGTERM on win32, do not SIGSTOP a bound llama-server (PLAT-S2, LIVE-SUSPEND, with RF4)
8. **PF8** UTF-8 console + NFC paths + translate-on-script (PLAT-L1, PLAT-L2)
9. **PF9** gitattributes eol + package start script + bin mode (PLAT-I3)

Tests go with each PF. No git push.

---

## PF1 — owned-port stop + pidfile

**Invariant:** `green-roomz stop`, pack `stop.sh`, and pack `stop.cmd` reap the same owned set: gateway PID plus every llama/whisper/sd child this serve spawned. They never image-kill every llama-server on the machine. They wait until listed ports are bind-free or they fail closed.

**Files:** `bin/green-roomz.mjs:37-38`, `:152-164`, `:341-344`; pack `stop.sh`; pack `stop.cmd`; `src/process-manager.mjs` (expose port list); `src/serve-console.mjs` (pidfile next to serve.log).

- On listen, write `data/serve.pid` (gateway) and `data/children.json` `{alias, pid, port}[]`, updated on start/stop/suspend.
- CLI `stop` without a live pidfile exits 1 with "no serve pidfile"; do not bootstrap an empty ProcessManager and claim stopped.
- If pidfile exists: SIGTERM the gateway (so existing SIGINT/SIGTERM drain runs `stopAll`), wait, then reap remaining child PIDs from children.json by PID not by image name.
- Pack `stop.sh`: drop POST /stop until that route exists (fuzz 404). Reap ports from children.json or, if missing, **all manifest llama ports** (8181-8187 plus 8080), not just 8080/8187. No GNU `xargs -r`. `sleep 1` not `sleep 0.5`.
- Pack `stop.cmd`: `taskkill /F /PID` those PIDs only. Never `/IM llama-server.exe`.

**Tests:** unit: stop with empty manager returns not-ok. Integration (Linux): spawn two llamas, write children.json, stop.sh leaves no LISTEN on those ports; a foreign PID named llama-server on another port is untouched (mock).

Compose with race RF4 for the in-process stopRecord wait. PF1 is the **out-of-process** half.

---

## PF2 — expandEnvironment fail-closed + default GRZ_ROOT

**Invariant (remainder):** B14 this P0 already allowlists GRZ_ROOT/GRZ_EXE/HOME, Object.hasOwn, and fail-closed empty command path. This PF does **not** re-do that. Remainder: percent-VAR on win32, default GRZ_ROOT to package root when unset (if B14 did not), GRZ_EXE from process.platform, path.join after expand, resolveManifestPath for runtime.command/env.

**Files:** `src/util.mjs:32-46`; `src/config.mjs:90-98`.

- **Skip if B14 landed:** allowlist, fail-closed empty command, Object.hasOwn.
- If GRZ_ROOT still unset after B14: default to package root via import.meta.url, not cwd.
- If GRZ_EXE unset: win32 .exe else empty (path-audit P3). Do not require the launcher.
- After expand, path.join so Windows does not keep mixed separators (P4). Resolve runtime.command and runtime.env too.
- percent-VAR on win32 only, or document-reject. Darwin NFC path normalize lives in PF8.
- Do not expand mailbox envelopes.

**Tests:** promote fuzz e001-e010 into `test/expand-environment.test.mjs`. Unset GRZ_ROOT + cursor json throws or defaults to pack root, never `/runtime/llama-server`. `${grz_root}` does not match. `%GRZ_ROOT%` on win32 either expands or is documented-rejected, not silently kept then spawned.

B14/Fuzz-10 own the expand hole this P0. PF2 remainder is next cut. Boundary still owns HTTP echo of expanded paths (B15/B21).

---

## PF3 — portable cursor manifest in git; default is not windows.json

**Invariant:** `loadManifest()` without `--manifest` loads a portable pack manifest, not shalom LocalAI. Git `config/agents.cursor.json` matches the pack (`GRZ_ROOT` + `GRZ_EXE` + relative models/). `agents.windows.json` remains a shalom overlay only.

**Files:** `src/constants.mjs:22`; `src/config.mjs:90`; `bin/green-roomz.mjs:43-44`; `package.json:11`; git `config/agents.cursor.json`; git `scripts/cursor-serve.sh`, `cursor-validate.sh`, `cursor-unit.sh`, `start-green-roomz.ps1`.

- Change `DEFAULT_MANIFEST` to `agents.cursor.json` (portable). Windows overlay is `--manifest config/agents.windows.json` on shalom only.
- Rewrite git cursor json like the pack. Rewrite cursor-*.sh to use GRZ_ROOT=`cd "$(dirname "$0")/.." && pwd` instead of `/workspace/green-roomz`.
- `start-green-roomz.ps1`: `$Root = $PSScriptRoot/..` or LocalAppData Green-Roomz; `where.exe node` / `$env:Path`, not hardcoded Program Files or Documents\\green-roomz.
- package.json start script: `node ./bin/green-roomz.mjs serve --manifest config/agents.cursor.json` (PF2 supplies GRZ_ROOT if unset).
- Pack already passes `--manifest config/agents.cursor.json`. Keep that. Pack has no agents.windows.json (correct).

**Tests:** `node bin/green-roomz.mjs validate` from pack root without env succeeds (or fails on missing GGUF, not ENOENT windows.json). Git cursor json has no `/workspace/green-roomz` string.

---

## PF4 — host binary selection + merge loader paths + spawn cwd

**Invariant:** spawn command is an executable that matches the host OS. Loader path env is prepended, not replaced. `cwd` is pack root.

**Files:** pack `start.sh:35-56,72`; `src/process-manager.mjs:361-430`; `bin/green-roomz.mjs:45-49`.

- After OS detect, if vendored `runtime/llama-server` is missing or `file` says the wrong ELF class, set `GRZ_LLAMA` to `command -v llama-server` and export it; manifest command becomes that path (or a new `${GRZ_LLAMA}` allowlisted in PF2).
- Do not `chmod +x` the bundled ELF until `file`/OSABI says it is native (today start.sh:25 chmods before the freebsd/darwin case, so `-x` is a false green and PATH llama is never selected).
- `buildLaunch` env: if `runtime.env.LD_LIBRARY_PATH` is set, prepend to existing `process.env.LD_LIBRARY_PATH` (keep `/usr/local/lib` on BSD). Same for DYLD on Darwin. Do not set `LD_LIBRARY_PATH` on win32 (PATH from start.cmd is the DLL search).
- `spawn(..., { cwd: packRoot, windowsHide: true, shell: false })`. packRoot = GRZ_ROOT after PF2.
- `serve-console` log under packRoot/data, not cwd (path-audit P14). Benchmark store same.
- Rename is optional: WindowsHostAdapter stays if time-tight; fingerprint kind already uses process.platform (PLAT-N1).
- stop.sh POSIX: no `xargs -r` (PF1).

**Tests:** buildLaunch with existing LD_LIBRARY_PATH keeps both dirs. spawn options include cwd. Document-only for BSD ELF mismatch until a FreeBSD runner exists (README already says not re-proven).

---

## PF5 — Termux artifacts under HOME

**Invariant:** nothing Termux must exec or mmap is required to live under `/data/local/tmp`. Drop zone stays write-once for adb. `termux-start.sh` is the only phone entry (bash-read 644).

**Files:** pack `termux-start.sh`; pack `deploy-android.sh`; `config/agents.note9.json`; `config/agents.android.json`; git `scripts/note9-run-llama-server.termux.sh`; git `scripts/note9-termux-setup.sh`; `src/benchmark.mjs:118`.

- note9.json: command stays `${HOME}/grz-runtime/run-llama-server.sh`. Resident model `${HOME}/grz-runtime/models/Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf`. missing-* specialists under `${HOME}/grz-runtime/missing/` or stay unavailable without tmp paths.
- `termux-start.sh` already copies the GGUF to HOME; stop relying on mmap of tmp. Mirror git note9-termux-setup.sh sed, or ship HOME paths so sed is unnecessary.
- Delete or rewrite `note9-run-llama-server.termux.sh` so it does not exec `/data/local/tmp/grz/bin/llama-server`.
- agents.android.json command: same wrap as note9, or copy ELF into `$GRZ_ROOT/runtime/bin` and keep the json. Do not leave a third layout.
- Wrap shebang: `#!/usr/bin/env bash` (path-audit P16) or spawn the ELF with LD_LIBRARY_PATH and skip the wrap.
- `benchmark.mjs`: `bench_command` on the runtime block, or replace wrap basename `run-llama-server.sh` -> `llama-bench` next to the ELF, not a string replace on the wrap path.
- `pkill -f` replaced by pidfile wait (PF1). Keep nohup. Wait 8080/8187 down before relaunch.

**Tests:** note9.json after expand contains no `/data/local/tmp` for command or resident model. benchmark command for wrap is not the wrap script itself.

No Knox, no su, no exec-from-tmp.

---

## PF6 — Windows CPU-only start/install

**Invariant:** pack start.cmd and install-windows.cmd never copy LocalAI vulkan binaries. Install fails closed if CPU llama-server is still missing or node is not on PATH. Uninstall waits until the exe is unlocked.

**Files:** pack `start.cmd:16-44`; pack `install-windows.cmd`; pack `uninstall-windows.cmd`; `/workspace/releases/beta-0.2-wip/` copies of the same; `INSTALL-WINDOWS.md`.

- Delete the `C:\\LocalAI\\llama-b10665-bin-win-vulkan-x64` fallback block from start.cmd. One fetch: official CPU zip b10702 (installer already does this).
- install-windows.cmd: after curl fail, do not `goto :llama_ok`. After `where node` fail, do not `goto :node_ok` just because Program Files exists (print PATH hint, exit 1 unless start.cmd can use the full node path).
- robocopy: skip Unix ELF names (`llama-server` without .exe, `*.so`) when dest is win32, or fetch CPU zip first and do not copy pack `runtime/` Linux blobs onto DEST.
- uninstall: call stop.cmd, wait until `runtime\\llama-server.exe` is not locked, then rmdir. Quote-escape VBS TargetPath (replace `"` ). Prefer .lnk; keep the Firefox .url warning.
- Git `scripts/start-green-roomz.ps1` is not the pack installer; after PF3 it uses PSScriptRoot. Do not point it at agents.windows.json.

**Tests:** grep start.cmd has no LocalAI string. install-windows.cmd has no goto llama_ok after curl errorlevel 1. Manual on qodesh is the real gate (this box is Linux).

---

## PF7 — SIGHUP, win32 kill, no SIGSTOP of a bound llama-server

**Invariant:** any death of the gateway process runs the same drain as SIGTERM. A suspended specialist does not keep a LISTEN socket that waitForPortsFree will call "free". On win32, do not pretend SIGTERM is graceful.

**Files:** `bin/green-roomz.mjs:152-164`; `src/process-manager.mjs:127-135`, `:510-525`, `:589-619`.

- `process.on("SIGHUP", () => shutdown(0))` on POSIX. On win32, listen for `SIGINT` is enough for Ctrl-C; document that closing the console is CTRL_CLOSE_EVENT (Node 22 may not map it to SIGTERM). Optional: `readline` SIGINT already fires on Ctrl-C in start.cmd.
- LIVE-SUSPEND: do **not** SIGSTOP llama-server while it holds a TCP port. Terminate + checkpoint (already on-stop) instead, **or** after SIGSTOP take it off the port (not possible without close). Prefer terminate: race RACE-P4 wanted refcount anyway; SIGSTOP of a bound server fights PF1/RF4. Windows already sets canSuspend false.
- stopRecord: after SIGKILL, wait for `exit` (RF4). waitForPortsFree fail-closed (RF4). Platform adds: treat HTTP timeout as **not free** if `ss`/`netstat` still shows LISTEN (or retry bind). Race owns the fetch loop; we own "suspended is not a successful wait skip."
- Optional later: Windows Job Object at spawn so console close kills children. Not required if pidfile reaping (PF1) is solid.

**Tests:** unit canSuspend false on win32 (already). POSIX: start a fake listen child, SIGSTOP, waitForPortsFree must not succeed. Gateway registers SIGHUP (listen count).

Do not double-implement waitForReady (RACE-P1).

---

## PF8 — UTF-8 console + NFC paths + translate-on-script

**Invariant:** 0.5B Tekken GGUF is an English JSON nexus only. Operator TTY/serve.log UTF-8. Paths NFC. No translation-agent alias. No homoglyph decoder.

**Files:** pack `start.cmd`; `src/serve-console.mjs`; `src/util.mjs` (new nfc helper); `src/routing.mjs:63-65`; `policies/general-text.md:6-8`; `src/compile-prompt.mjs:65`.

- **Do not bind** Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf to general-text or code. Pack cursor json currently does (regression vs git windows.json). doctor/validate: warn if GGUF `general.languages` is en-only on those aliases.
- Keep 0.5B as resident nexus (English JSON route) if RAM-tight. For general-text ship a Qwen-tokenizer instruct GGUF (git windows already uses Qwen3-4B).
- Drop or narrow general-text.md "Do not translate merely because the source language differs from the UI language." Do not add translation-agent (config.mjs:52 stays).
- Keep MFL off the 0.5B path (token tax vs 4096/2048 ctx).
- start.cmd: `chcp 65001 >nul` before node. NFC-normalize paths on darwin. Strip UTF-8 BOM in loadManifest.
- F4 this P0 owns U+2028/U+2029. PF8 only adds remaining bidi U+2066-U+2069 if F4 missed them, plus utf8 byte cap on headerSafe. Truncation: bytes/tokens not JS `.length` for HANDOFF_PEEK (48 chars).

**Tests:** routing: "übersetze das" or a CJK-only user line is allowed to hit general-text without the English word translate (if detector kept). Kernel file with BOM loads. Slash `/code` still ASCII-only (intentional).

---

## PF9 — gitattributes, package start, bin mode, shebang

**Files:** `.gitattributes`; `package.json:11`; `bin/green-roomz.mjs` mode; git `scripts/cursor-serve.sh:1`; pack zip generation.

- `.gitattributes`: `*.sh text eol=lf`; `*.cmd text eol=crlf`; `*.ps1 text eol=crlf`; keep policies/prompts lf.
- package.json start: see PF3 (manifest + PF2 GRZ_ROOT).
- Pack zip: `chmod 755` start.sh stop.sh deploy-android.sh termux-start.sh runtime/llama-server. bin/green-roomz.mjs may stay 644 if always invoked via node; then drop the shebang **or** chmod 755 and keep `#!/usr/bin/env node`.
- cursor-serve.sh: `#!/usr/bin/env bash`.
- start.sh already `chmod +x` llama-server; also chmod itself is a zip problem, not a runtime one. README chmod line stays as belt-and-suspenders.

**Tests:** `file` on pack `.cmd` is CRLF; `.sh` is LF. `git ls-files scripts/*.cmd` attributes crlf on Windows checkout.

---

## Shared / do not double-implement

- Race **RF4** (P1 this series): health is this PID; stopRecord waits exit; waitForPortsFree timeout = occupied. PF1/PF7 **delta-fold only** into that plus launcher pidfile/port-reap. Do not fork waitForReady.
- Race **RF2**: hop refcount forbids SIGSTOP of in-flight. PF7 next-cut is idle SIGSTOP that still LISTENs (LIVE-SUSPEND :8184).
- Race **RF3 / covert F5**: nexus stays 4. Empty set = do not spawn. Platform does not change --threads.
- Boundary **F-B1** API-key product is P2. Do not mint a bearer in start.sh this pack.
- Boundary **B14 / Fuzz-10**: `${}` allowlist + fail-closed command path this P0. PF2 remainder only (percent-VAR, default GRZ_ROOT, GRZ_EXE from platform, path.join).
- Covert **F4**: U+2028/U+2029 (and possibly U+202A-U+202E) this P0. PF8 next-cut: chcp 65001, NFC paths, remaining bidi U+2066-U+2069 if F4 missed them, drop or narrow the do-not-translate line. No homoglyph decoder. No translation-agent alias.

## Out of scope this pack

- Proving FreeBSD/qodesh/Note9 on this Linux box.
- Shipping a Windows llama-server.exe in the slim zip.
- Adreno/Vulkan on Note9.
- translation-agent alias.
- Knox/Magisk/root.
- Security P0 src items (RF1-RF3, Fuzz-1..6, F4, F14, reject envelopes). Researcher owns those.
- API-key product (F-B1 P2).
- Homoglyph decoder.

## Status

Next cut after security P0 (or beta-0.3 if operator says go). No tree patch. No git push. Live e2e gateway left running (do not stop.sh).


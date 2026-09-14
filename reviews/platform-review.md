# Green-Roomz platform compatibility review (pass 1)

Trees: git `/workspace/green-roomz`; live pack `/workspace/e2e-fresh/green-roomz` (gateway `127.0.0.1:8080` pid 1849424, llama `:8187` pid 1903795, extra llama `:8184` pid 1904007). Windows installer lives in the pack (`install-windows.cmd`, `INSTALL-WINDOWS.md`); `/workspace/releases/beta-0.2-wip/` is absent (only `beta-0.1`). Git vs pack `src/` is byte-identical; launchers and `config/agents.cursor.json` diverge.

Scope: path naming, process signals/lifetime, installer/runtime seams, localization / why the 0.5B fails off English. No exploit / PoC. No tree patch. Race/boundary/covert findings are not restated except where they are also platform seams (port reuse after SIGKILL, RACE-P1/P2).

Live policy held: no reboot/lockdown/git push. `stop.sh` was not run (it would SIGKILL 8080/8187 and miss `:8184`).

---

## Critical

### PLAT-S1 — `green-roomz stop` does not stop the running serve
- **finding:** `bin/green-roomz.mjs` command `stop` calls `bootstrap()` then `ctx.processes.stopAll()`. That is a **new** empty `ProcessManager`. It does not POST the live gateway, does not read a pidfile, does not reap 8080/8187. Usage text claims "asks a running local gateway to drain". Pack `stop.sh` POSTs `/stop` (404 on this pack) then `fuser -k` on **only** 8080 and 8187.
- **file:line:** `bin/green-roomz.mjs:37-38`, `:341-344`; pack `stop.sh:3-12`; pack `stop.cmd:3-9`; live `ss`: node `:8080`, llama `:8187` **and** llama `:8184`.
- **impact:** CLI stop is a no-op. `stop.sh` leaves specialist llama PIDs (live evidence: `:8184`). Next `start.sh` can RACE-P1-probe the leftover.
- **fix:** CLI `stop` must talk to the live process (an HTTP drain that actually exists, or a pidfile under `data/`). Launchers must reap **every** owned llama port (8181-8187), then wait for bind-free. Do not advertise `/stop` until the route exists.

### PLAT-I1 — FreeBSD/Darwin `start.sh` accepts system llama, then Node still spawns the Linux ELF
- **finding:** `start.sh` on freebsd/netbsd/openbsd/darwin treats `command -v llama-server` as success. It then `exec node` with `--manifest config/agents.cursor.json`. Pack cursor command is `${GRZ_ROOT}/runtime/llama-server${GRZ_EXE}` (Linux x86_64 ELF in this zip; `GRZ_EXE` empty). `ProcessManager.buildLaunch` uses `runtime.command` only. There is no rewrite to the PATH binary, no ELF check, no POSIX host adapter besides a misnamed `WindowsHostAdapter`.
- **file:line:** pack `start.sh:35-56`, `:72`; pack `config/agents.cursor.json:23-44`; `src/process-manager.mjs:301-368`; `bin/green-roomz.mjs:45-49`; `src/hosts/` contains only `windows.mjs` and `android.mjs`.
- **impact:** `start.sh` prints `OS=freebsd` and then spawn fails (exec format) or a leftover Linux binary cannot load `/usr/local/lib` because spawn **overwrites** `LD_LIBRARY_PATH` with only `${GRZ_ROOT}/runtime` (`process-manager.mjs:361`). README admits BSD was not re-proven. Same for macOS `.so` vs `.dylib`.
- **fix:** After OS detect, point `runtime.command` at the binary that will actually exec (PATH llama on BSD/Darwin; pack ELF on Linux). Merge loader paths instead of clobbering. Refuse to spawn if the file type does not match the host.

---

## High

### PLAT-P1 — missing env keys become empty paths
- **finding:** expandEnvironment in src/util.mjs:32-40 replaces placeholders with env[key] or empty. Nested placeholders are not keys. Windows percent-syntax is left literal. Regex is case-insensitive; lookup is case-sensitive on Linux. Pack cursor command uses GRZ_ROOT and GRZ_EXE; if the launcher is skipped those expand empty and spawn becomes /runtime/llama-server.
- **file:line:** `src/util.mjs:32-40`; pack `config/agents.cursor.json:26`, `:43`; `src/config.mjs:90-93`; `package.json:11`.
- **impact:** Spawn of a root-relative llama-server path. Fuzz already saw missing-key to empty string; here it is a path bug.
- **fix:** Unknown env placeholders must fail closed at loadManifest. Expand percent-VAR on win32. Drop case-insensitive match or lookup exact case. Default GRZ_ROOT to the pack root when unset.

### PLAT-P2 — git cursor manifest is box-absolute; pack is portable; loadManifest default is shalom LocalAI
- **finding:** Git cursor json is box-absolute. Pack is GRZ_ROOT-portable. Default loadManifest is agents.windows.json.
- **file:line:** git config/agents.cursor.json:26-43; pack same file :26; src/config.mjs:90; src/constants.mjs:22; package.json:11; git config/agents.windows.json:26-40; scripts/start-green-roomz.ps1:2-6.
- **impact:** A zip of the git tree is Linux-only and box-absolute. Default serve on Linux loads the Windows LocalAI overlay. Two Windows roots: Documents checkout vs LocalAppData Green-Roomz.
- **fix:** Keep one portable cursor/pack manifest in git. Default --manifest from process.platform / pack root. agents.windows.json is a shalom overlay, not the default. Stop hardcoding the Documents path in scripts/.

### PLAT-P3 — Termux copies the GGUF into HOME then still mmaps /data/local/tmp
- **finding:** SELinux untrusted_app cannot exec /data/local/tmp (documented; deploy-android.sh chmod 644 on the snippet so bash can read it). termux-start.sh copies ELF plus GGUF into HOME/grz-runtime and writes run-llama-server.sh. agents.note9.json command correctly uses HOME/grz-runtime/run-llama-server.sh, but tool-router-agent.model is still /data/local/tmp/grz/models/Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf. Whisper/vision/code/text models are /data/local/tmp/grz/missing/. Fallback agents.android.json command is GRZ_ROOT/runtime/bin/llama-server (does not match the wrap).
- **file:line:** pack deploy-android.sh:3-6 and :67-73; pack termux-start.sh:2-6, :31-53, :55-68; config/agents.note9.json:21-25 vs tool-router model path; config/agents.android.json:21; docs/note9-termux.md.
- **impact:** Nexus mmap depends on Termux being allowed to read the adb drop zone. If that read is blocked or tmp is deleted after copy, serve starts and llama fails on --model. Specialist aliases are hard-missing under tmp. agents.android.json is a footgun if note9.json is absent.
- **fix:** Point every note9 artifact at HOME/grz-runtime/models/ (the copy termux-start.sh already makes). Keep tmp as drop-only. Make agents.android.json command the same wrap, or drop it from the Termux path.

### PLAT-S2 — Windows stop kills every llama-server on the machine; Linux stop is too narrow
- **finding:** pack stop.cmd force-kills every llama-server image then PIDs listening on 8080/8187. Spawn uses windowsHide, shell false, no detached, no job object, no new process group. pack stop.sh only 8080/8187 via fuser -k or lsof plus kill, no wait. Neither waits for waitForPortsFree. ProcessManager.stopRecord sends SIGTERM then SIGKILL after 3s; on win32 Node maps both to TerminateProcess, so the grace period is fiction. canSuspend is false on win32 (good). Leftover helpers of llama are not tracked. bin/green-roomz.mjs handles SIGINT/SIGTERM only; no SIGHUP.
- **file:line:** pack stop.cmd:4-9; pack stop.sh:6-12; src/process-manager.mjs:133, :426-430, :510-525, :608-619; bin/green-roomz.mjs:152-153.
- **impact:** On qodesh/shalom, stop.cmd can kill a LocalAI llama-server that is not this pack. On Linux, specialists leak (live :8184). SIGHUP (SSH drop, Termux hangup without nohup) kills Node without shutdown(), so llama leftovers hold ports. Ctrl-C in start.sh (exec node) is SIGINT and drains. Closing a Windows console is CTRL_CLOSE_EVENT, not SIGTERM.
- **fix:** Own a pidfile plus the manifest port list. Windows: kill those PIDs only, or a Job Object at spawn. Handle SIGHUP like SIGTERM. After a hard kill, waitForPortsFree must fail closed (RACE-P2) before start. Map win32 graceful stop to llama /exit HTTP or Ctrl-break, not a fake SIGTERM.

### PLAT-I2 — start.cmd still copies vulkan LocalAI; installer forbids it
- **finding:** Pack INSTALL-WINDOWS.md / install-windows.cmd: no-admin LocalAppData\\Green-Roomz, CPU zip only, no LocalAI fallback, never vulkan/cuda, never 8600 GT GGUF. Pack start.cmd does copy LocalAI llama-b10665 vulkan llama-server into runtime\\ if the CPU binary is missing (comment says manifest stays --device none). Git agents.windows.json is vulkan-on via LocalAI. Start Menu .lnk via cscript; .url fallback can be hijacked by Firefox on qodesh (docs already warn).
- **file:line:** pack start.cmd:16-44; pack install-windows.cmd:3-16, :111-143, :145-173; pack INSTALL-WINDOWS.md; git config/agents.windows.json:26-40.
- **impact:** A CPU pack start on a box that also has LocalAI silently plants a vulkan-built binary next to CPU dlls. Wrong DLL set, start fail, or GPU probe on the 8600 GT the installer exists to prevent. Installer and start.cmd disagree.
- **fix:** Delete the LocalAI fallback from start.cmd. One fetch path (installer). If the CPU binary is missing, print the CPU zip URL and exit 1. Keep agents.windows.json off the pack start path.

### PLAT-I3 — package.json start script / default manifest / green-roomz.mjs mode 644
- **finding:** package.json start script is `node ./bin/green-roomz.mjs serve` (no --manifest, no GRZ_ROOT). Default manifest is agents.windows.json. bin/green-roomz.mjs is mode 644 with a shebang; calling it via node works, executing the shebang path does not. .gitattributes pins LF only for build/prompts/** and policies/**, not *.sh or *.cmd. Pack launchers: .sh LF+755, .cmd CRLF+644 (good). Git scripts/*.cmd are LF.
- **file:line:** package.json:11; src/config.mjs:90; pack bin/green-roomz.mjs mode 644; .gitattributes:1-5; git scripts/start-green-roomz.cmd crlf=0.
- **impact:** LF .cmd is usually OK on Win10+ and broken on some OEM cmd parsers. The package start script on the Linux pack loads Windows vulkan paths. Shebang-without-+x is fine only because launchers call node.
- **fix:** package start script should match pack start.sh / start.cmd behavior. eol=crlf for *.cmd and *.ps1, eol=lf for *.sh. chmod +x the bin in the pack zip, or stop shipping a shebang.

### PLAT-L1 — 0.5B Qwenstral is English-framed, ASCII-routed, and forbidden to be a translator
- **finding:** Resident model is Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf (~439 MiB Q4). Cursor pack ctx 4096; note9/android/windows nexus ctx 2048. Stock frames and kernels are English (policies/frames, tool-router.md, general-text.md). Nexus is kernel-only, MICROKERNEL_MAX_CHARS 512, must emit English JSON with route/confidence/reason. Slash parse is ASCII /([a-z]+) plus English tokens (/code /text /chat /draw). translation-agent is prohibited at validate. isExplicitTranslationRequest is word-boundary translate/translation on string contents only (multimodal text parts ignored). general-text.md: do not translate merely because the source language differs from the UI language. Compile normalize is CRLF-only, not NFC. No LANG/LC_ALL/chcp. toLowerCase / localeCompare without locale. Console tee writes UTF-8 into a Windows OEM code page TTY.
- **file:line:** pack config/agents.cursor.json tool-router model + ctx; config/agents.note9.json ctx 2048; src/constants.mjs:21-22 and :92; src/config.mjs:52; src/routing.mjs:63-65, :126-143, :262-264; src/compile-prompt.mjs:65; policies/general-text.md:6-8; policies/tool-router.md; src/serve-console.mjs:4-21; pack start.cmd (no chcp 65001).
- **impact:** Off-English chat hits the 0.5B with English system+MFL tokens burning the 2k-4k window; BPE blow-up on morphology (TR/FI/HU/AR) and some RTL; nexus reason tokens in English; slash/translate detectors that never see CJK/DE/AR verbs; explicit instruction not to translate unless the English word appears; Windows console mojibake so the operator cannot see CJK/RTL logs. Qwen vocab covers CJK better than Latin-small-BPE, but capacity at 0.5B plus English frames is the failure, not missing Chinese tokens.
- **fix:** Keep translation as a capability of general-text, but detect non-English script (and explicit local verbs) as a translate ask, or drop the do-not-translate line for the 0.5B catch-all. Do not add MFL to the nexus. Raise note9 ctx only if RAM allows. chcp 65001 in start.cmd; serve.log is already UTF-8. NFC-normalize path strings on Darwin. Do not add a translation-agent alias (policy). Document that 0.5B Q4 is an English router with weak L2, not a multilingual product.

---

## Medium

### PLAT-P4 — mixed separators, MAX_PATH, reserved names
- **finding:** Pack command after expand is GRZ_ROOT + /runtime/llama-server + GRZ_EXE (forward slashes on Windows). Node spawn usually accepts it. resolveManifestPath accepts drive letters and UNC. Relative models resolve dirname(manifest)/../candidate (pack models/ from config/ to repo-root models/, correct). Checkpoint dirs alias.replace non-alnum to underscore: an alias CON/NUL/PRN would land on a Win32 reserved device. No long-path prefix. LocalAppData\\Green-Roomz plus nested ggml so names is under 260 for C:/Users/brian; a long user name plus unzip-in-unzip is not guaranteed. Spaces in GRZ_ROOT are quoted in .cmd; spawn argv does not re-split (good). Colons other than drive letters are not filtered from expansions.
- **file:line:** src/util.mjs:43-46; src/process-manager.mjs:146-147, :368; pack start.cmd:4-8; pack install-windows.cmd:10.
- **fix:** path.join / path.toNamespacedPath for win32. Reject reserved Win32 basenames for aliases, checkpoint tags, and GGUF filenames. Fail if expanded path length is over 240 unless long-path is enabled.

### PLAT-P5 — spawn env clobbers LD_LIBRARY_PATH / no cwd
- **finding:** env = { ...process.env, ...runtime.env } so pack LD_LIBRARY_PATH=GRZ_ROOT/runtime replaces the value start.sh just built (runtime:/usr/local/lib on BSD, DYLD on Darwin). spawn has no cwd: GRZ_ROOT. Relies on the launcher cd. Start Menu .lnk sets WorkingDirectory; a raw node bin/green-roomz.mjs from another cwd writes data/serve.log to the wrong place (serve-console.mjs uses process.cwd()).
- **file:line:** src/process-manager.mjs:361-368, :426-430; src/serve-console.mjs:13-16; pack start.sh:36, :47.
- **fix:** Prepend, do not replace, loader paths. cwd = pack root (GRZ_ROOT or path.resolve(manifestDir, "..")). Console log under that root, not cwd.

### PLAT-S3 — Termux pkill -f plus nohup; wrap shebang is Termux-specific
- **finding:** termux-start.sh pkill -f green-roomz.mjs serve then nohup node with pidfile HOME/grz-serve.pid. pkill is SIGTERM default, no wait, does not kill wrap/llama children. Wrap shebang is Termux bash; spawn without shell:true execve the script and needs +x (chmod 755 present). set -uo pipefail (no -e). exec to process substitution tee can fail on some Android bash builds.
- **file:line:** pack termux-start.sh:1-4, :47-71.
- **fix:** Stop via pidfile plus child port list. Wait for 8080/8187 down before nohup. Keep the wrap; do not spawn llama-server from tmp.

### PLAT-I4 — installer copy/shortcut/uninstall races
- **finding:** robocopy /E copies the Linux runtime/llama-server ELF onto Windows DEST alongside a later CPU binary fetch. if errorlevel 8 is the correct robocopy convention. VBS shortcut interpolates DEST: spaces in the Windows user name are OK if quoted; a quote in the path is not escaped. .url fallback URL=DEST\\start.cmd is a file URL Firefox may steal. uninstall-windows.cmd calls stop.cmd then rmdir /s /q with no wait: Win32 will fail to delete llama-server if it is still mapped. Installer continues to ok after a failed CPU zip fetch (goto llama_ok). Node found off-PATH still goto node_ok and tells the user to run start.cmd (which will fail where node).
- **file:line:** pack install-windows.cmd:71-80, :118-123, :145-173, :188-213, :221-224; pack uninstall-windows.cmd:12-16.
- **fix:** Wait for stop before rmdir. Fail closed if the CPU binary is still missing. Do not node_ok when where node failed. Quote-escape VBS paths. Exclude Unix ELF names when copying onto win32, or fetch the CPU zip first and skip packing Linux runtime into the Windows DEST.

### PLAT-L2 — locale-dependent fold / regex / bidi
- **finding:** Slash tokens are ASCII so Turkish I/dotless-i is not a live bug for /CODE. localeCompare on profile ids is ASCII. \\w in looksLikeCouncilTarget is Unicode in modern Node (some letters count as word chars) vs ASCII-only [a-z]. stripControls / stripEscapes drop C0/C1/CSI/OSC but not bidi marks (U+202A-U+202E, U+2066-U+2069): RTL reason strings can reorder operator logs. headerSafe slices 240 JS chars, not columns (CJK wide glyphs / emoji ZWJ). JSON responses declare charset=utf-8 (good). JSON.parse of UTF-8 manifests (good). No BOM strip on readFile.
- **file:line:** src/routing.mjs:161, :197; src/util.mjs:129-146 and :148-152; src/profile-selector.mjs:30.
- **fix:** Keep slash matching ASCII-only on purpose. Strip bidi isolates from headers/reasons. Byte-length header caps. Drop UTF-8 BOM in loadManifest / kernel reads.

---

## Low / notes

- **PLAT-N1** WindowsHostAdapter is the POSIX adapter too (bin/green-roomz.mjs:47-49). Fingerprint kind becomes linux/freebsd via process.platform. Works; name lies. Android sidecar is only used when GREEN_ROOMZ_ANDROID_SIDECAR is set; Termux does not set it.
- **PLAT-N2** deploy-android.sh exits 0 on "no device" so Linux CI validate stays green. Fine if documented; a real Android deploy can look successful.
- **PLAT-N3** Pack README: Windows/FreeBSD/Android launchers not re-proven on this box. Agree.
- **PLAT-N4** start.sh chmod +x runtime/llama-server then checks -x. Zip extract without +x is handled on Linux. Android tmp is 644 on purpose.
- **PLAT-N5** GRZ_EXE empty vs .exe is the right idea if GRZ_ROOT is set (pack launchers). Git cursor json ignores it (absolute Linux path).
- **PLAT-N6** Live health not re-probed this pass (fuzz: degraded 200). Extra llama on :8184 is leftover-child evidence, not a crash.
- **PLAT-N7** Overlap: RACE-P1 stale /health, RACE-P2 hard-kill then next spawn, RACE-L3 thread oversubscribe. Not duplicated as platform-primary.
- **PLAT-N8** No Knox/Magisk in the Termux path (correct). Do not add it.
- **PLAT-N9** join-grz-zip.cmd at /workspace is not a pack launcher.

---

## Git vs pack (launcher)

| artifact | git tree | e2e-fresh pack |
|---|---|---|
| start.sh / start.cmd / stop.* | absent at root | present |
| install-windows.cmd + md | absent | present (CRLF) |
| agents.cursor.json | /workspace/green-roomz absolute | GRZ_ROOT + GRZ_EXE |
| agents.windows.json | present, default loadManifest | absent |
| src/*.mjs | identical | identical |
| scripts/*.cmd | LF | pack .cmd CRLF |

---

## Why 0.5B Qwenstral degrades off English (short)

1. **Capacity:** 0.5B Q4 plus English agency/MFL/kernel tokens. Note9 ctx 2048.
2. **Routing language:** nexus JSON schema and slash table are English; non-Latin slash commands never parse.
3. **Policy:** translation-agent banned; catch-all told not to translate unless the user said the English word.
4. **Tokenizer:** Qwen BPE is decent for CJK, expensive for agglutinative and some RTL; mixed-script lines fragment.
5. **Host:** Windows ACP vs UTF-8, no chcp 65001, NFC vs NFD paths, LANG unset.
6. **Not the main issue:** missing Chinese vocab. The model can emit CJK; it cannot hold the English constitution and a morphologically rich user turn in 2k tokens and still route.

---

## Pass-1 status

Board is source-backed (launchers, hosts, process-manager, util, manifests, live ss). Did not run stop.sh, did not patch, did not write PoCs. Next: platform-pass2.md (peer boards plus missed installer docs) then platform-fixes.md for Researcher integrate.


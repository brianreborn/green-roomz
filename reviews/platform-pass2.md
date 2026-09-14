# Green-Roomz platform second pass

Date: 2026-09-03. First board: `/workspace/reviews/platform-review.md`.
Trees: git `/workspace/green-roomz` (citations) and live pack `/workspace/e2e-fresh/green-roomz` (serve). `src/` is `diff -q` equal.

Did not patch. Did not reboot. Did not run stop.sh (would hard-kill 8080/8187 and miss :8184).

Sibling boards read: race-review, race-pass2, race-fixes, boundary-review, boundary-pass2, boundary-fixes, covert-review, covert-fixes, covert-pass2, fuzz-review.

---

## Live 127.0.0.1:8080 (read-only)

Observed 2026-09-03 ~11:47Z (PT 04:47). Gateway pid still 1849424 (fuzz). Llama pids changed: nexus 1903795 on :8187 (was 1849480); general-text 1904007 on :8184.

- health 200 degraded, policy responsive, uptime_ms ~2.09e6
- tool-router-agent ready resident; security-monitor-agent ready (logical)
- general-text-speculator **suspended** in /health, but llama still LISTENs on 127.0.0.1:8184 (child of gateway 1849424)
- qwenstral-code-speculator cold; others unavailable (missing-* under pack models/runtime, paths already expanded to /workspace/e2e-fresh/green-roomz/...)
- mailbox/ipc pushed 11, size 0 after drain
- both llama cmdlines: pack runtime/llama-server, mmap, --device none, --threads 4, --n-gpu-layers 0. GRZ_ROOT expansion worked for this serve.

Fuzz leftover :8184 is not a zombie; it is a SIGSTOP specialist that still owns the TCP port. That is a platform lifetime bug, not only a race.

---

## First-board verdicts after live + peers

| ID | Pass-2 |
|---|---|
| **PLAT-S1** | Keep critical. Live :8184 is the exhibit: stop.sh would miss it. CLI stop still empty-manager. Fuzz HTTP /stop 404 agrees.
| **PLAT-I1** | Keep critical. Not exercised on this Linux box (pack ELF matches). Code path unchanged.
| **PLAT-P1** | Keep high. This serve has GRZ_ROOT set (health missing-* paths are pack-absolute). Empty expansion is the no-launcher path.
| **PLAT-P2** | Keep high. Pack cursor json is portable; git is not. Default loadManifest still windows.json.
| **PLAT-P3** | Keep high. Not live here (no adb). note9 model path still tmp.
| **PLAT-S2** | Keep high. Linux half live-confirmed (narrow ports). Windows image-kill not run here.
| **PLAT-I2** | Keep high. Installer vs start.cmd disagreement is pack-only; git start-green-roomz.ps1 is a third Windows story.
| **PLAT-I3** | Keep high. package.json start script still bare serve.
| **PLAT-L1** | Keep high. Health lists general-text native_capabilities translation-on-request, which matches the kernel, not a translator alias. Fuzz expandEnvironment empty-key is the same P1 function.
| **PLAT-P4/P5/S3/I4/L2** | Unchanged. P5 env clobber not visible on Linux pack (no /usr/local/lib needed).
| **PLAT-N6** | Update: :8184 is general-text SIGSTOP, ppid=gateway, still LISTEN. Not a leak from a crashed parent.

---

## New / raised

### LIVE-SUSPEND — SIGSTOP llama still binds the port
- **from:** live ss :8184 + health availability suspended; race RACE-P4 (SIGSTOP mid-graph) and process-manager.mjs:133 canSuspend POSIX-only.
- **file:** src/process-manager.mjs:127-135, :589-595, :608-619
- **platform:** Linux/Android/BSD. Windows canSuspend false so this path does not run.
- **impact:** waitForPortsFree fetch to /health on a stopped listener times out and is treated as free (catch return false). Next spawn of the same alias can fail bind or RACE-P1-probe a frozen PID. stop.sh does not list 8184 so a later start.sh leaves two llamas. SIGSTOP does not drop TCP LISTEN.
- **fix:** Before marking suspended, or in waitForPortsFree, require the listen socket gone *or* never SIGSTOP a bound llama-server (terminate + checkpoint instead). Race RF4 fail-closed is necessary but not sufficient if suspended is considered "not a port to wait on."

### Note — fuzz expandEnvironment
- fuzz: missing key to empty string; nested placeholder leftover; path-like interpolates HOME. That is PLAT-P1. Fail closed in loadManifest; do not change mailbox tests that rely on empty expansion unless Researcher wants one helper with a strict mode.

### Note — race RF4 / RACE-P1/P2
- Port reuse after hard kill is race-primary. Platform pack owns launcher reaping (S1/S2) and SIGHUP. Do not double-implement waitForReady.

### Note — boundary F-B1 pack start.sh
- Boundary pack wants a bearer in start.sh/start.cmd. Compatible: set GREEN_ROOMZ_API_KEY in the same launchers we fix for GRZ_ROOT. Not a platform finding.

### Note — covert F5 thread pin
- Live nexus --threads 4 on 8 CPUs. Platform does not own the cap. SIGSTOP specialist also has --threads 4: two llamas, 8 threads, host nproc=8. That is RACE-L3-adjacent, live here because suspended still runs the GGML pool (SIGSTOP actually freezes those threads, so CPU is not 8-way until SIGCONT). Mention only.

---

## Integration hazards

- **RF4 vs LIVE-SUSPEND:** if waitForPortsFree is only called for terminated victims, suspended aliases keep the port forever. Integrate: either no SIGSTOP of llama-server, or waitForPortsFree also on resume/restart of that alias.
- **PF1 stop vs live serve:** do not run pack stop.sh on this box during integrate; it would kill the e2e gateway and miss :8184.
- **Git vs pack cursor json:** packing must keep rewriting git absolute paths until P2 lands in git. Integrate against git tree; copy launchers from pack.
- **agents.windows.json:** shalom overlay. CPU installer must not start using it.

---

## Pass-2 status

Pass-1 holds. New live fact: suspended general-text still owns :8184. Fix pack next: platform-fixes.md.


## Path-audit addenda (executor, after pass-2 draft)

- **beta-0.2-wip** exists at `/workspace/releases/beta-0.2-wip/`: INSTALL-WINDOWS.md, SMOKE-WINDOWS.md, install-windows.cmd, uninstall-windows.cmd only (no zip). Pack e2e-fresh already has the same four plus start/stop. Treat wip as the docs source of truth for PF6.
- **Boundary B14-B17** is the same expandEnvironment empty-key / resolveManifestPath / echoed paths. Platform owns fail-closed loadManifest (PF2). Boundary owns HTTP echoing expanded paths. Fuzz e001-e010 is the test corpus to promote into `test/` (none exist today for expandEnvironment; `test/native-paths.test.mjs` is Win drive/UNC only).
- **git note9-termux-setup.sh** sed-rewrites the tmp GGUF path; pack `termux-start.sh` does not (PLAT-P3). git `note9-run-llama-server.termux.sh` still execs `/data/local/tmp/grz/bin/llama-server`.
- **P20** `src/benchmark.mjs:118` rename llama-server -> llama-bench does not match the Termux wrap `run-llama-server.sh`. Fold into PF5.
- **stop.sh** GNU `xargs -r` and `sleep 0.5` (OpenBSD sleep is integer). Fold into PF1/PF4.
- **Pack ENOENT:** `node bin/green-roomz.mjs serve` without --manifest looks for agents.windows.json which the pack does not ship. Strengthens PLAT-P2/I3.
- **cursor-serve.sh** `#!/bin/bash` not `env bash` (BSD). Fold PF9.


---

## Pass 3 — integrate-refinement (security P0 vs next cut)

Source: `/workspace/reviews/integrate-refinement.md` (Researcher stitch, ~04:49 PT). That file still says pass2/fixes are missing; they landed minutes later. This section is the delta-fold they asked for. Tree stays frozen. Do not stop live serve to prove PLAT-S1.

### Bindings taken as given (do not fork)

- Race order RF1 then RF2 then RF3. Covert F1 sleep after PolicyGate release. F13 restore only refs=0 and slot idle. F22 logger drop ok:false.
- Cursor 8-core: nexus --threads stays 4. Empty CPU set = do not spawn. Do not drop nexus to 2.
- F-B1 API-key product is **P2**, not P0. Loopback remains the v1 trust boundary. Drop the earlier "mint bearer in start.sh" compose note from this pack.
- F4 stripControls/headerSafe/stripEscapes include U+2028/U+2029 this cut. Platform PLAT-L2 bidi isolates (U+202A-U+202E, U+2066-U+2069) wait for next cut unless F4 already covers the 202A-E range — then PF8 only adds U+2066-U+2069 + chcp + NFC + translate-policy, and does not invent a homoglyph decoder or a translation-agent alias.
- HTTP 404 for lockdown/reboot stays. 8080 never owns reboot.
- **F-B14 / Fuzz-10 / PLAT-P1 overlap this P0:** `${}` allowlist (GRZ_ROOT, GRZ_EXE, HOME); Object.hasOwn; fail closed on empty command path (`src/util.mjs:32-40`). Platform owns percent-VAR / Darwin NFC / default GRZ_ROOT — **not this cut**.
- **RF4** (P1, this security series): health is this PID; stopRecord waits exit; waitForPortsFree timeout = occupied. Composes with PLAT-S1 leftovers when platform next-cut lands. Do not reimplement waitForReady here.

### This pack vs that cut

| Platform ID | This security P0 | Next cut (platform-fixes PF*) |
|---|---|---|
| PLAT-P1 empty `${}` | B14 allowlist + fail-closed command path | percent-VAR, `/i` lookup, default GRZ_ROOT (PF2 remainder, PF3) |
| PLAT-S1 leftover ports / empty-manager stop | cite only; RF4 port-free | PF1 pidfile + reap 8181-8187 (pack launchers, not src P0) |
| LIVE-SUSPEND :8184 SIGSTOP still LISTEN | RF2 forbids SIGSTOP of in-flight; RF4 wait | PF7: do not SIGSTOP a bound llama even when idle; launcher reaping |
| PLAT-I1 BSD Linux ELF | not this cut | PF4 |
| PLAT-S2/S3 stop.cmd / Termux pkill | not this cut | PF1/PF5 |
| PLAT-P2/P3/P4/P5 paths | not this cut (B14 only the expand hole) | PF3/PF5/PF4 |
| PLAT-I2/I3/I4 installer | pack, not a security patch | PF6/PF9 |
| PLAT-L1/L2 l10n | F4 LS/PS only | PF8 |

### Do not

- Patch `src/` this turn (Researcher owns P0 apply).
- Run pack stop.sh against 127.0.0.1:8080.
- Invent OS findings beyond platform-review.md + live :8184 already recorded.
- Fork a parallel waitForPortsFree implementation.
- Add API-key mint, translation-agent, Knox, homoglyph fold.

---

## Pass-3 status

Pass-1 and pass-2 hold. Security P0 is Researcher integrate (RF1-RF3, fuzz HTTP shape, F4, F14, reject envelopes). Platform-fixes.md retitled as **next cut** (beta-0.3 / after P0). PF2 allowlist portion is already assigned to B14 this cut — PF2 in our pack is the remainder only.


---

## Pass 4 — late installer/signal/l10n facts (next cut, not src P0)

Did not patch. Did not stop.sh. Security P0 unchanged.

### PLAT-L1 correction (was too soft)

Shipped GGUF `models/Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` (git+pack, 460616064 bytes):
- `general.architecture` qwen2, `general.languages` **only `en`**
- tokenizer `gpt2` / **tekken** (Mistral), vocab 131072
- script buckets: cjk=0 kana=0 hangul=0 arabic=0 hebrew=0 cyrillic=0 devanagari=0 thai=0 byte_fallback=0
- chat template default system is English Mistral Small 3

Pack `agents.cursor.json` binds this file to nexus **and** general-text **and** code. Git windows.json uses it as nexus only (text=Qwen3-4B, code=qwen2.5-coder-7B). Pack is the regression. Pass-1 said Qwen vocab covers CJK; that is **false** for this GGUF (Tekken, not Qwen tokenizer).

English stock frames still apply: MFL ~4175 chars on general-text+code. Pack 4096 ctx burns ~1.3-1.6k Tekken tokens of English system before the user speaks. Offline plan (`logical-router.mjs` English `\\bcode\\b` / `\\btranslate\\b`) is what actually routes non-English when nexus JSON is junk. `HANDOFF_PEEK_CHARS = 48` is JS `.length`.

**Fix (PF8):** keep 0.5B as resident JSON nexus only; do not bind it to general-text/code. `doctor`/`validate` warn if `general.languages` is en-only on those aliases. Do not add translation-agent. chcp/NFC/bidi remainder still next cut. F4 LS/PS stays this P0.

### PLAT-I1 extra: chmod +x before OS detect

`start.sh:25` chmod +x the bundled llama-server **before** the freebsd/darwin case. `-x` then succeeds on a Linux ELF, so the PATH fallback never runs. Spawn still uses `${GRZ_ROOT}/runtime/llama-server`. Do not chmod a foreign ELF (PF4).

### PLAT-S1 extra: live tree and stop.sh SIGKILL

- Outer bash 1849409 (agent `./start.sh` redirect) is still parent; node 1849424 + llamas 1903795/1904007 share PGID 1849409. No pidfile on Linux serve. Spawn not detached.
- `fuser -k` on this box is SIGKILL of node, which **skips** stopAll. Specialists on 8184 survive. SIGSTOP llama ignores SIGTERM until SIGCONT; stop.sh does not CONT first.
- `waitForPortsFree` is HTTP-only, 8s, **no throw**, only called from evict, not stopAll/shutdown. `uncaughtException` hard-exits at 2s.
- Git `start-green-roomz.ps1` **intentionally** `cmd /c start` so serve escapes the agent Job Object (leftover by design vs Cursor teardown).

### Other

- beta-0.1 has `console.sh` (reads `/proc/$pid/status`) and start.sh calls it; e2e pack does not ship console.sh.
- beta-0.1 has no install-windows.cmd; 0.2-wip is installer-only; e2e pack has both launchers and installer.
- `agents.android.json` has no LD_LIBRARY_PATH. deploy-android.sh exit 0 on no device.
- registry `fileExists` is F_OK only, no X_OK, no ELF/OSABI check.

---

## Pass-4 status

PLAT-L1 raised: 0.5B is English-only by construction (Tekken, languages en). Pack uses it for all three live aliases. PF8 rewritten. Still next cut, not security P0. Live serve left up.


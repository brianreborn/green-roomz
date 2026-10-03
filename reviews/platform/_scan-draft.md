# Platform scan draft — Green-Roomz

**Scanned:** 2026-09-12T00:27:31Z  
**Trees:** `/workspace/session/green-roomz` + `/workspace/grz-src` (ahead) + known-bugs + system-requirements + RELEASE-READINESS  
**Output:** `_scan-findings.json` (17 findings)  
**Counts:** path 7 · signal 5 · locale 5 · severity blocker 2 / high 7 / med 6 / low 1 / note 1  
**note9:** unknown (unwired Android sidecar; no Termux map)

## Top issues

1. **P-001 blocker — Hardcoded `C:\LocalAI`**  
   Default `config/agents.windows.json` embeds absolute Windows paths for every runtime/model. `expandEnvironment` exists (`util.mjs:32-34`) but manifests never use `${GRZ_ROOT}`. Blocks Termux/$HOME, Android `/data/local/tmp`, D: relocate, POSIX.

2. **S-001 blocker — Name-based kill vs owned-only requirement**  
   Spec §9.1 requires Job Object / process-group identity and forbids killing by exe name. `scripts/stop-green-roomz.ps1:9-10` and `switch-bench.ps1:27` `Get-Process llama-server | Stop-Process`. `process-manager.mjs` spawn has no job object. README claims owned-only lifecycle.

3. **P-005 high — Host adapter always Windows**  
   `bin/green-roomz.mjs:42-44` both branches construct `WindowsHostAdapter`. `AndroidSidecarAdapter` (`hosts/android.mjs`) never selected; Gate E / note9 blocked.

4. **S-002/S-003 high — Graceful stop gap**  
   `stopRecord` uses `child.kill('SIGTERM'|'SIGKILL')` (`process-manager.mjs:285-289`). CLI `stop` bootstraps empty manager (`bin:172-173`) — no-op against live serve — pushing operators to name-kill.

5. **P-002/P-003 high — Path env + scripts**  
   Missing `${VAR}` → `''` silently. Start scripts hardcode Codex output tree + `C:\Program Files\nodejs\node.exe`.

6. **L-001/L-002 high — English-only linguistics**  
   `logical-router.mjs` / `routing.mjs` match `\btranslate\b` / English code/draw lexemes only. Piper voice is `en_US-lessac-medium.onnx`. Nexus policy English-only. Far-from-English turns miss translation/image intent.

7. **L-004 med — session vs grz-src**  
   `grz-src/util.mjs` adds `stripControls`/`headerSafe`; session util lacks them. Platform header/console safety differs by tree; qodesh still lagging.

8. **S-004/S-005 med — Abort + orphans**  
   Health fetch uses `AbortSignal.timeout(1500)` not chained to parent; start.ps1 uses fixed sleeps (spec forbids). No Job Object → orphan llama-server after hard node kill.

## Fix-pack candidates (titles only)

| Hint | Files |
|------|--------|
| GRZ_ROOT template manifest | `config/agents.*.json`, README |
| Strict `${}` expansion | `src/util.mjs`, `src/config.mjs` |
| Script-relative roots | `scripts/start-*.ps1`, `switch-bench.ps1` |
| Owned-only stop + Job Object | `process-manager.mjs`, `stop-green-roomz.ps1`, hosts/windows |
| Remote drain CLI stop | `bin/green-roomz.mjs` |
| Host adapter selection | `bin/green-roomz.mjs`, `hosts/android.mjs` |
| Multilingual intent + voice catalog | `logical-router.mjs`, `routing.mjs`, manifest piper |
| Sync grz-src sanitizers | session `util.mjs`/`gateway.mjs` ← grz-src |
| UTF-8 log/console notes | `process-manager.mjs`, README |
| Android path cookbook | new agents.android.json / docs |

## Gaps

No posix/android manifests; no MAX_PATH/reserved-name tests; no NFC/NFD; process-manager not in grz-src pack; SELinux/Termux `$PREFIX` uncoded; note9 unregistered.

## Method note

Read hosts/windows+android, util, config, process-manager, constants, bin, scripts/*.ps1; rg path/signal/locale patterns; compared session vs grz-src; folded operator notes from README, system-requirements §9/§13, known-bugs, RELEASE-READINESS. No patches applied.

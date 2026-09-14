# Platform PF1–PF9 apply notes

Date: 2026-09-06 ~05:15 PT. Tree: `/workspace/green-roomz`. Live serve left up (`127.0.0.1:8080` node + `:8187` llama). **No git commit/push.** Diff left unstaged. Did **not** run pack `stop.sh` against live ports.

Sources: `/workspace/reviews/platform-fixes.md`, `/workspace/reviews/integrate-refinement.md`. Security P0 assumed already on tree; this cut is the platform next pack.

## Bindings kept

- Prefer P0 where overlap: B14-style `${}` allowlist was **not** present on tree after P0 (F-B14 was P1 in integrate). Operator PF2 asked for allowlist + fail-closed + default `GRZ_ROOT` → implemented here and noted as coordinating with B14.
- Do **not** fork `waitForReady` (RF4/RACE-P1). PF1 is out-of-process pidfile/port-reap; in-process `stopRecord` exit-wait remains RF4 territory (only small PF7 TCP `portBusy` / fail-closed `waitForPortsFree` delta).
- Do **not** SIGSTOP bound llama (PF7 / LIVE-SUSPEND): `canSuspend` now requires explicit `gateway.suspend_evicted === true` (default **false**). Opt-in path still covered by existing unit test that forces `canSuspend = true`.
- 0.5B Tekken stays English JSON **nexus only** (PF8). No translation-agent alias. No homoglyph decoder. No Knox/API-key product.

## Per-item

| ID | Outcome |
|---|---|
| **PF1** | `data/serve.pid` + `data/children.json` from ProcessManager; CLI `stop` reads pidfile (exit 1 if missing — never empty `stopAll` claim); pack `stop.sh`/`stop.cmd` copied into git root; reap ports **8080 + 8181–8187**; no POST `/stop`; no `xargs -r`; no `taskkill /IM llama-server.exe`; `sleep 1`. |
| **PF2** | `expandEnvironment` allowlist `GRZ_ROOT`/`GRZ_EXE`/`HOME`/`GRZ_LLAMA` + `Object.hasOwn`; case-sensitive (`${grz_root}` untouched); `%VAR%` documented-rejected (left literal); `withDefaultGrzEnv` defaults `GRZ_ROOT` to package root via `import.meta.url`; fail-closed empty/unresolved/collapsed `/runtime/llama-server` command; path normalize after expand; resolve `runtime.command`/`env`. |
| **PF3** | `DEFAULT_MANIFEST` → `agents.cursor.json`; package `start` passes that manifest; git cursor json rewritten to `${GRZ_ROOT}`/`${GRZ_LLAMA}` (no `/workspace/green-roomz` in raw file); `cursor-*.sh` + `start-green-roomz.ps1` portable (`PSScriptRoot` / PATH node). `agents.windows.json` remains shalom overlay only. |
| **PF4** | `start.sh`: OS detect **before** chmod; refuse Linux ELF on BSD/Darwin; set `GRZ_LLAMA` to PATH llama when needed; merge `LD_LIBRARY_PATH`/`DYLD_*` (prepend, keep `/usr/local/lib`); `buildLaunch` merges loader paths; spawn `{ cwd: packRoot, windowsHide, shell:false }`; serve log under packRoot/`data`. |
| **PF5** | `agents.note9.json` / `agents.android.json`: command + resident model under `${HOME}/grz-runtime`; missing specialists under `${HOME}/grz-runtime/missing/`; `termux-start.sh` + `note9-termux-setup.sh` pidfile/port wait (no `pkill -f`); wrap shebang `#!/usr/bin/env bash`; `note9-run-llama-server.termux.sh` no longer execs `/data/local/tmp`; `benchmark.mjs` does not treat wrap script as `llama-bench`. |
| **PF6** | `start.cmd`: removed `C:\LocalAI` vulkan fallback; `chcp 65001`; curl fail → `exit /b 1`. `install-windows.cmd`: curl/expand/node-not-on-PATH fail closed; robocopy `/XF llama-server *.so`. `uninstall-windows.cmd`: stop then wait for exe unlock. |
| **PF7** | `SIGHUP` → same drain as `SIGTERM` (POSIX). Default no SIGSTOP. `waitForPortsFree` uses TCP connect; timeout ⇒ still occupied (`false`). |
| **PF8** | Cursor/pack: 0.5B only on `tool-router-agent` with `languages: ['en']`; code/general-text point at `missing-qwen-instruct.gguf`. Narrowed `policies/general-text.md` translate line; BOM strip in `loadManifest`; `nfcPath` on Darwin; bidi U+2066–U+2069 in strip helpers; `headerSafe` UTF-8 byte cap; `start.cmd` `chcp 65001`. Recompiled `build/prompts/` from windows manifest after policy edit. |
| **PF9** | `.gitattributes` eol for `*.sh` LF / `*.cmd`/`*.ps1` CRLF; package start script; `bin/green-roomz.mjs` mode 755 (shebang kept); cursor-serve `#!/usr/bin/env bash`; pack launchers chmod 755. |

## P0 conflicts / notes

- **B14 / F-B14:** Not landed in the recorded P0 apply (`util.mjs` still had open `${}`). PF2 implemented the allowlist + fail-closed command path here (operator priority). If Researcher later lands an identical B14, prefer that and drop the duplicate — behavior should match.
- **RF4:** Did not reimplement full `stopRecord` exit-after-SIGKILL wait; only PF7 port-busy fail-closed for out-of-process compose.
- **Live e2e:** Old in-memory process on `:8080`/`:8187` was **not** restarted onto this tree. `data/serve.pid` absent (so CLI stop is safe no-op). **Do not** run `./stop.sh` while proving PF1 against this live gateway (would reap `:8080`/`:8181–8187`).

## Tests run (`node --test`)

```
test/expand-environment.test.mjs
test/platform-pf.test.mjs
test/config.test.mjs
test/process-manager.test.mjs
test/util-strip.test.mjs
test/cpu-set.test.mjs
test/scheduler.test.mjs
test/mailbox.test.mjs
test/sessions.test.mjs
test/compile-prompt.test.mjs
test/gateway.test.mjs
test/proxy.test.mjs
test/benchmark.test.mjs
```

**158 pass, 0 fail.**

Also: `node bin/green-roomz.mjs validate --manifest config/agents.cursor.json` → ok (code/text degraded on missing instruct GGUF; nexus 0.5B present). `green-roomz stop` → `{ok:false, error:"no serve pidfile"}` exit 1; live ports unchanged.

## Pack copies

Launcher fixes also synced into `/workspace/e2e-fresh/green-roomz/` (and cursor/note9/android configs where applicable) so the unzipped pack matches git.

## Live ports after apply (PT)

- `127.0.0.1:8080` node pid 1329948 — still listening
- `127.0.0.1:8187` llama-server pid 1329974 — still listening

## Not done / out of scope

- FreeBSD/Darwin/qodesh/Note9 hardware proof on this Linux box
- Shipping Windows `llama-server.exe` in slim zip
- API-key product (F-B1 P2)
- Homoglyph decoder / translation-agent
- Git commit/push

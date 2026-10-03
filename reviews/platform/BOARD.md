# Platform compatibility board — Green-Roomz

**Owner:** Platform Reviewer  
**Updated:** 2026-09-12 (first wake)  
**Trees:** `/workspace/session/green-roomz` (box session) · `/workspace/grz-src` (patch pack, ahead)  
**Hosts in scope:** shalom (Win Vulkan, offline) · qodesh (Win CPU, online) · note9 / Android Termux+sidecar (**unregistered**)  
**Rules:** no exploits/PoCs · no tree patches from this seat · fix packs → Researcher for integrate · no reboot/lockdown/git push

## Status snapshot

| Area | Grade | Notes |
|------|-------|-------|
| Path / naming | **C** | Hard-coded `C:\LocalAI`; silent `${}` empty; no `GRZ_ROOT`; no Android path roots |
| Process signals / lifetime | **C+** | Owned spawn + AbortSignal plumbing OK; Job Object / process-group gap vs spec; blunt PS stop |
| Loc / linguistics | **D+** | UTF-8 HTTP OK; English-only policies + ASCII slash; no NFC/ACP/console-CP story |
| note9 readiness | **F** | Not in ListMachines; no `agents.android.json`; sidecar handshake only |

## Findings

### P1 — Paths

| ID | Sev | Title | Evidence | Risk | Hosts |
|----|-----|-------|----------|------|-------|
| PATH-01 | **high** | Manifest paths are absolute `C:\LocalAI\…` with no `GRZ_ROOT` | `config/agents.windows.json` runtime `command` + agent `model` fields (e.g. L21–52) | note9/Termux, second-drive installs, and qodesh layout drift all require hand-edits; pack cannot relocate | windows, note9, android |
| PATH-02 | **high** | `expandEnvironment` replaces missing `${VAR}` with `''` | `src/util.mjs:32-34` (same in grz-src) | Empty `model`/`command` after expand → late `unavailable`, not fail-fast validate | all |
| PATH-03 | **med** | `resolveManifestPath` accepts drive/UNC but never `\\?\` long-path; no MAX_PATH guard | `src/util.mjs:43-46` | Deep LocalAI trees / non-ASCII dirs can break Win32 APIs under 260 | windows |
| PATH-04 | **med** | Relative resolve assumes manifest lives under `config/` (`dirname/..`) | `util.mjs:46` + `loadManifest` field walk `config.mjs:60-63` | Custom `--manifest` outside `config/` mis-roots `policies/…` and relative artifacts | all |
| PATH-05 | **med** | No reserved-name / colon-in-segment / trailing-dot-space checks | absent in util/config | Windows `CON`/`NUL`/trailing `.` landmines if any client-influenced path ever reaches disk (today mostly operator-authored) | windows |
| PATH-06 | **high** | Android path model missing: no Termux `$HOME`, no `/data/local/tmp`, no SELinux exec bit story | `hosts/android.mjs` handshake-only; README “Termux or container”; requirements §13 | note9 cannot qualify Gate E; exec from wrong root fails SELinux | note9, android |
| PATH-07 | **med** | Case folding: `fileExists` is raw `access`; Win case-insensitive vs Termux case-sensitive | `util.mjs:17-24` + registry inspect | Same relative casing works on shalom, breaks on note9 | note9, posix |
| PATH-08 | **low** | Runtime `command` paths are **not** run through `resolveManifestPath` | `config.mjs:60-63` only `model|draft_model|projector|system_policy` | Relative runtime commands stay unresolved; absolute Win paths only today | all |

### P2 — Signals / lifetime

| ID | Sev | Title | Evidence | Risk | Hosts |
|----|-----|-------|----------|------|-------|
| SIG-01 | **high** | Spec requires process-group / Windows Job Object identity; implementation kills the direct child only | requirements ~L80, L500, L767 vs `process-manager.mjs:281-295` `child.kill('SIGTERM'|'SIGKILL')` | Orphan helpers / future multi-process runtimes; Win SIGKILL semantics ≠ posix | windows, all |
| SIG-02 | **high** | `scripts/stop-green-roomz.ps1` force-stops **all** `llama-server` + any `node …green-roomz.mjs` | stop script L3-12 | Cross-user / second GRZ / manual llama-server collateral; violates “only manager-owned” | windows |
| SIG-03 | **med** | `bin/green-roomz.mjs` always constructs `WindowsHostAdapter` on non-win32 | `bin/green-roomz.mjs:42-44` | Fingerprint/`applyPriority` wrong on Linux Termux gateway host | note9, posix |
| SIG-04 | **med** | Android LMK / process death called recoverable in requirements; no LMK-aware restart class in ProcessManager | requirements §13.2 vs `process-manager.mjs` exit→`cold` only | note9 background kill looks like hard failure | note9, android |
| SIG-05 | **note** | AbortSignal threaded through ensure/start/sleep/fetch; resident nexus preserved across specialist starts | `process-manager.mjs:116-126`, `gateway`/`handoff`/`nexus` signal args | Good — keep | all |
| SIG-06 | **note** | Spawn: `shell:false`, `windowsHide:true`, stdio pipes — solid Win defaults | `process-manager.mjs:207-212` | Good — keep | windows |
| SIG-07 | **low** | CLI `stop` help says drain; PS stop is Force | `bin` usage L33 vs PS script | Operator confusion on graceful vs kill | windows |

### P3 — Localization / linguistics

| ID | Sev | Title | Evidence | Risk | Hosts |
|----|-----|-------|----------|------|-------|
| LOC-01 | **high** | System policies + nexus prompts are English-only; HANDOFF protocol is English tokens | `policies/*.md`; nexus AVAILABLE/USER fencing | Non-English user text still routes via English-trained 0.5B nexus; morphology/script far from English → wrong specialist / over-HANDOFF | all (esp note9 locale) |
| LOC-02 | **med** | Slash tokens ASCII `[a-z]+` only (grz-src) | `grz-src/routing.mjs:105-107` | Fullwidth／CJK “commands”, Arabic punctuation, etc. never parse as slash | all |
| LOC-03 | **med** | Header/MIME sniff uses `toLowerCase()` (default locale) | routing/proxy/handoff `toLowerCase` | Rare Turkish-I style bugs on headers; prefer ASCII lower | all |
| LOC-04 | **low** | Profile sort uses `localeCompare` without explicit locales | `profile-selector.mjs:30` | Host-locale reorder of equal scores — minor nondeterminism | all |
| LOC-05 | **med** | No path NFC normalization; no console CP / ACP story for PS scripts | absent | Win ACP vs UTF-8 Node; NFD from macOS sync (if any) vs NFC GGUF names | windows |
| LOC-06 | **med** | Piper voice hard-coded `en_US-lessac-medium.onnx` | `agents.windows.json` speech agent model | Non-English TTS not first-class | all |
| LOC-07 | **note** | HTTP declares `charset=utf-8`; `stripControls` in grz-src (C0/C1) — good direction | util/handoff in grz-src | Keep; still open: raw SSE ESC to client (known-bugs) | all |
| LOC-08 | **high** | Tokenizer/vocab coverage unstated for nexus 0.5B on RTL/CJK/emoji-heavy turns | no board prior; policies assume Latin HANDOFF JSON | note9 operators often mixed AR/HE/CJK; BPE fragmentation → route noise | note9 |

## note9 / local-host gap list

1. Register note9 (or Termux SSH / Grok Bot machine) — currently **absent** (qodesh connected, shalom offline).
2. Decide gateway root: Termux `$PREFIX` / `$HOME` vs app `/data/local/tmp` vs sidecar-only inference.
3. SELinux: which binaries are `exec`able; where GGUFs may live; noexec mounts.
4. Manifest flavor: `agents.android.json` with `${GRZ_ROOT}` (or Termux-native vars), not `C:\LocalAI`.
5. Host adapter: stop lying with WindowsHostAdapter on `android`/`linux`; wire sidecar fingerprint + LMK restart policy.
6. Loc: document LANG/LC_ALL expectations inside Termux; UTF-8 filesystem; Arabic/RTL chat smoke.

## Fix-pack candidates (titles only — Researcher integrates)

| Pack | Touches | Addresses |
|------|---------|-----------|
| `fp-grz-root-expand` | `util.mjs`, `config.mjs`, manifest template | PATH-01,02,08 — require known vars; fail validate on empty expanded path; introduce `GRZ_ROOT` |
| `fp-path-guardrails` | `util.mjs`, tests | PATH-03,05,07 — long-path opt-in, reserved names, optional case-normalize policy flag |
| `fp-job-object-lifetime` | `process-manager.mjs`, Win host, stop script | SIG-01,02,07 — Job Object / process group; stop only owned PIDs |
| `fp-host-adapter-select` | `bin/green-roomz.mjs`, `hosts/*` | SIG-03,04 · PATH-06 — platform select; Android path + LMK notes |
| `fp-locale-routing-surface` | policies, nexus prompt, routing slash | LOC-01,02,08 — document English nexus constraint; ASCII-fold slash; non-English smoke cases |
| `fp-agents-android-stub` | `config/agents.android.json` | PATH-01,06 — Termux-shaped paths via `${GRZ_ROOT}` |

## Non-goals this board

- Writing patches or PoCs
- Reboot / lockdown stubs
- `git push`
- Exploiting path traversal (Boundary owns abuse cases; we flag FS assumptions only)

## Next actions

1. ~~Inventory~~ done (this board).
2. Merge deep-scan supplement when `_scan-findings.json` lands.
3. Ping Researcher with fix-pack shortlist once you confirm priority (Job Object vs GRZ_ROOT vs note9 machine first).
4. When note9 machine appears: fingerprint + path probe board addendum (read-only).

## Sources

- `/workspace/session/green-roomz/src/{util,config,process-manager,hosts/*}.mjs`
- `/workspace/session/green-roomz/{bin/green-roomz.mjs,config/agents.windows.json,scripts/stop-green-roomz.ps1}`
- `/workspace/grz-src/{util,routing}.mjs`
- `/workspace/session/green-roomz-system-requirements.md` §§ process identity, Android §13
- `/workspace/reviews/green-roomz/RELEASE-READINESS.md`
- `/workspace/session/known-bugs.md`

## Addendum 2026-09-12 (Note9 Release stand-up)

- Track `origin/host/note9` (42 ahead of `main@eb4a9f7`): Termux, peer allowlist, routing harden, piper, language-input — **not on this box yet** (no GH auth; note9 machine unregistered).
- Issue #2 = note9 bring-up. This team owns note9 integrate+ship; other team keeps qodesh/Windows.
- Platform gate stays **note9 F** until we can read `host/note9` or probe a registered Termux host. Next scan target once either lands: `$PREFIX`/`$HOME` vs `/data/local/tmp`, SELinux exec, case-sensitive FS vs Windows baseline findings PATH-01/06/07 · SIG-03/04 · LOC-01/08.
- Cross-ref: `/workspace/reviews/release/RELEASE-READINESS.md`

## Deep-scan merge (2026-09-12T00:27Z)

Source: `_scan-findings.json` (17) + `_scan-draft.md`. Aligns with board PATH/SIG/LOC ids; new deltas below.

| Scan ID | Board | Sev | Delta vs first board |
|---------|-------|-----|----------------------|
| P-001 | PATH-01 | blocker | Confirmed; elevate PATH-01 → **blocker** |
| P-002 | PATH-02 | high | Confirmed |
| P-003 | *(new)* | high | **PATH-09** start/switch scripts hardcode Codex tree + `C:\Program Files\nodejs\node.exe` (`scripts/start-green-roomz.ps1:2-3`, `switch-bench.ps1:3`) |
| P-004 | PATH-03/04/08 | med | Confirmed bundle |
| P-005 | SIG-03 | high | Elevate SIG-03 → **high** (Android never selected) |
| S-001 | SIG-02 | blocker | Elevate SIG-02 → **blocker**; also `switch-bench.ps1` name-kill |
| S-002 | SIG-01 | high | Confirmed |
| S-003 | SIG-07 | high | **SIG-08** CLI `stop` bootstraps empty ProcessManager — no-op vs live serve (`bin/green-roomz.mjs` stop path) |
| S-004/S-005 | *(new)* | med | **SIG-09** health `AbortSignal.timeout(1500)` not chained to parent; start.ps1 fixed sleeps |
| L-001/L-002 | LOC-01/06 | high | Also English `translate` / draw/code lexemes in logical-router/routing |
| L-004 | LOC-07 | med | session util still lacks `stripControls`/`headerSafe` (grz-src has them) |

### Assumed cut order (widget skipped)

Note9 Release owns this cut → default push order without waiting on Brian:

1. **fp-grz-root-expand** + strict `${}` (P-001/P-002) — unblocks Termux/`$HOME` manifests  
2. **fp-host-adapter-select** + android stub (P-005 / PATH-06)  
3. **fp-job-object-lifetime** + owned-only stop / remote drain (S-001/S-002/S-003) — Windows collateral, still release-blocking  
4. Locale packs after path/host land  

Holding integrate at Researcher until they pull packs; I will not patch the tree.

### New PATH-09 / SIG-08 / SIG-09 (short)

- **PATH-09 high** — PS start roots are Codex paste paths, not `$PSScriptRoot` / `GRZ_ROOT`.  
- **SIG-08 high** — `green-roomz stop` does not talk to the running serve.  
- **SIG-09 med** — cold-start health abort not parent-linked; start script sleeps vs health.


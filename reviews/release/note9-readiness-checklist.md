# Note9 readiness checklist (living)

**Updated:** 2026-09-12 (planning-package sync)  
**Plan:** `/workspace/reviews/release/note9-release-plan-2026-09-12.md`  
**Planning package:** `/workspace/reviews/release/PLANNING-PACKAGE-2026-09-12.md`  
**Issue:** [#2](https://github.com/brianreborn/green-roomz/issues/2)  
**Tips:** `main@eb4a9f7` · `host/note9@260db2a` (**42 behind** main — correct via `host/note9...main` compare)  
**Rules:** localhost / adb-forward · no push · no reboot/lockdown success · no exploit steps · do not invent tweet bodies

Mark `[x]` only with evidence (SHA, path, or dated probe).

---

## A. Source / branch

- [ ] Confirm GitHub: `main` tip `eb4a9f7`
- [ ] Confirm `host/note9` tip `260db2a` and **behind_by 42**
- [ ] Local integrate tree includes note9 docs/scripts from `main` (not stale tip alone)
- [ ] No unauthorized `git push`

## B. Device / Termux (`docs/note9-termux.md`)

- [ ] Device SM-N960U reachable (adb serial `27841130ae1c7ece` or successor)
- [ ] No root / no Magisk for this cut
- [ ] Runtime at `~/grz-runtime` (not exec from `/data/local/tmp`)
- [ ] JS tree at `~/green-roomz` with `config/agents.note9.json`
- [ ] `allow-external-apps` / Termux setup as needed
- [ ] Logs under `$HOME` or `/sdcard/Download/grz` after `termux-setup-storage`

## C. Manifest / models (`config/agents.note9.json`)

- [ ] `validate --manifest config/agents.note9.json` passes
- [ ] Resident `tool-router-agent` model present under documented models path
- [ ] `max_warm_specialists: 1`, headroom 256 MiB path exercised or documented
- [ ] Missing specialists report unavailable (not crash)
- [ ] `security-monitor-agent` present (logical)
- [ ] `allow_peers` set intentionally (empty/loopback-only OK until LAN UAT)

## D. Serve / health

- [ ] `serve` listens `127.0.0.1:8080`
- [ ] `/health` → 200
- [ ] Nexus `:8187` resident
- [ ] `adb forward` (e.g. `tcp:18080`→`8080`) chat smoke OK
- [ ] Vision/audio without specialist → **503** (not text-model 500) — `260db2a` lineage

## E. Security (defensive)

- [ ] Peer non-allowlisted → **403** (when non-loopback bind tested)
- [ ] Public `0.0.0.0` blocked unless key + `GREEN_ROOMZ_ALLOW_PUBLIC=1`
- [ ] Capability / modality gates on slash (Boundary P0) or fix-pack dated
- [ ] Lockdown/reboot paths **reject** (404/501/403) — never empty success
- [ ] Security slash + activity watchdog present (`9889493`)
- [ ] Tunnel/WAN: design-only until allowlist+key; no open punch

## F. Linguistics / Brainz / primary sources

- [ ] Papers→surface map acknowledged (plan §5 / planning package §1)
- [ ] `GREEN_BRAINZ_ROOT` import-by-ref (#10) smoked **or** explicitly blocked-on-pack
- [ ] English-nexus constraint documented; optional non-EN smoke
- [x] **Primary-source gap marked:** live X login wall — `from:` search blocked; only partial 2026 public cards in `x-primary-source-2026-09-12.md` (no note9/Termux/linguistics/compsci release detail in visible window)
- [x] **Primary-source have:** 2022 `@electrobrians` archive themes + note9 precursor section in `x-archive-2022-themes.md` (cutoff 2022-06-27; zero Termux/LLM/Grok/locale/tokenizer)
- [ ] Twitter/X quote paste for papers status IDs / deeper 2026 timeline — **pending** (do not invent); citation URLs only until bodies verified
- [ ] Operator decision: deeper X capture authorized **or** ship on archive + partial cards + GitHub/papers only

## G. Dual-team

- [ ] This team owns note9 paths; other account idle / off those files
- [ ] Windows/`agents.windows.json` left to other team on wake
- [ ] Quota collision noted if other Researcher wakes mid-edit

## H. UAT / Issue #2 exit

- [ ] Issue #2 checklist items ticked on GitHub (or mirrored here with dates)
- [ ] Measured tok/s still consistent with fleet-targets (23.8 tg32 class) or re-measured
- [ ] Adreno Vulkan deferred explicitly
- [ ] Release Driver sign-off for note9-local cut

---

## Quick status snapshot

| Gate | Status (2026-09-12) |
|------|---------------------|
| Branch truth | **Corrected:** main +42 vs host/note9 |
| Device registered here | **Open** |
| Security capability | Code on main; enforcement gaps per boundary board |
| Linguistics fold-in | Map written; implementation pending |
| Primary sources | **Partial:** GitHub+papers+2022 archive HAVE; live X **login-walled**; 2026 cards partial / non-technical for cut |
| Twitter quote paste | **Pending** — do not invent |
| Ship | Hold until Phase D–E green |


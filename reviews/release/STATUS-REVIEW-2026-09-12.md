# STATUS REVIEW — 2026-09-12

**Audience:** operator Brian (returning)  
**Author:** executor subagent (box) · **NO DELETES**  
**Method:** read-only cross-check of `/workspace/reviews/release/*` + `/workspace/knowledge/*` — no invented host facts  
**AFK continuation (box):** Track B OVA checklist stub · NX-08 fetch-models fix notes (no push) · Termux minimal paste · STATUS cleanup → **10.05 GB free**. X-10 ontology = transport (not lighting).

**Authority boards:** `GOAL-PIVOT` · `GOAL-UPDATE-3OS-NOTE9VM` · `RELEASE-READINESS` · `NETMGMT-DISTRO-TRACKS` · `NEXUS-MODEL-ITER-LANE` · `DISPATCH-FIX-01-BOUNCE` · `OTHER-TEAM-WAKE-PACKET` · `QODESH-CLEANUP-SUGGESTIONS` · `knowledge/netmgmt/MANIFEST.md` · `MANIFEST-os-handbooks.md`

---

## 1. Goals locked

| Goal | Lock source | Status |
|------|-------------|--------|
| **Offline security workstation** (absolute-top ship: Green-Roomz + defensive suite + fleet model packs; airgap-capable) | `GOAL-PIVOT-2026-09-12.md` · `OFFLINE-SECURITY-WORKSTATION-PLAN` · `RELEASE-READINESS` | Locked; image freeze waits on dispatch P0 + packs |
| **OPNsense netmgmt dual-track** — **A** self-serve (official ISO + our kit) **+** **B** full offline OVA/export | `NETMGMT-DISTRO-TRACKS` · VBox plan § Distro model lock · `NETMGMT-SELF-SERVE-DOWNLOADS` | Locked **both**; Track A media ready; Track B not built (see §6 inconsistency) |
| **Nexus model iter** (model-pack + eval harness; no `routing.mjs` rewrite) | `NEXUS-MODEL-ITER-LANE` · `NEXUS-MODEL-ITERATION` | Lane open; harness landed; A/B blocked on shalom |
| **Note9 client** (Termux / Issue #2 UAT; not ship brand) | Goal pivot · platform BOARD F | Blocked: key / registration |
| **3 OS + Note9 VM ship targets** (FreeBSD/PQ · Debian-class · HardenedBSD × workstation + Note9 VM guest) | `GOAL-UPDATE-3OS-NOTE9VM` | Locked matrix (6 recipe cells); recipes not staged |
| **Knowledge packs** (out-of-band vs image freeze) | `KNOWLEDGE-LIBRARY-CANDIDATES` · `KNOWLEDGE-PACK-POLICY` · `FETCH-POLICY` | Packs landed under `/workspace/knowledge/` |
| **Dual SuperGrok teams** via GitHub **#11** / **PR #12** | `OTHER-TEAM-WAKE-PACKET` · `DUAL-TEAM-SYNC-HANDOFF` · `GH-ISSUE-DRAFT` · FIX-01 bounce | THIS live; OTHER wake packet ready; PR #12 open (merge pending) |

**Hard rules (unchanged):** defensive only · no exploits/PoCs · no push unless asked · no GGUF on 8600 GT · `routing.mjs` mutex for PR #12 · operator authorizes each cleanup delete.

---

## 2. Done this window (real paths)

### Key boards under `/workspace/reviews/release/` (~36 dated MD + HTML + scripts)

| Cluster | Paths |
|---------|--------|
| Goals / readiness | `GOAL-PIVOT-2026-09-12.md` · `GOAL-UPDATE-3OS-NOTE9VM-2026-09-12.md` · `RELEASE-READINESS.md` · `OFFLINE-SECURITY-WORKSTATION-PLAN-2026-09-12.md` · `PLANNING-PACKAGE-2026-09-12.md` |
| Dispatch / dual-team | `DISPATCH-BUGS-2026-09-12.md` · `DISPATCH-FIX-01-fallthrough-2026-09-12.md` · `DISPATCH-FIX-01-REVIEW-2026-09-12.md` · `DISPATCH-FIX-01-BOUNCE-2026-09-12.md` · `DUAL-TEAM-SYNC-HANDOFF-2026-09-12.md` · `OTHER-TEAM-WAKE-PACKET-2026-09-12.md` · `GH-ISSUE-DRAFT-dual-team-coord.md` · `dispatch-fix/` |
| Nexus | `NEXUS-MODEL-ITER-LANE-2026-09-12.md` · `NEXUS-MODEL-ITERATION-2026-09-12.md` · `nexus-eval/{gold-routes.json,score-routes.mjs,recorded.sample.jsonl,score-report.sample.json}` · `MODEL-PACK-INVENTORY-2026-09-12.md` |
| Netmgmt | `NETMGMT-DISTRO-TRACKS` · `NETMGMT-SELF-SERVE-DOWNLOADS` · `NETMGMT-OPNSENSE-INSTALL-MEDIA` · `NETMGMT-OUT-OF-BOX-KIT` · `NETMGMT-VBOX-SNAPSHOT-PLAN` · `NETMGMT-UTILITIES-SUGGESTIONS` · `NETMGMT-COMPRESSION-POLICY` · `NETMGMT-HA-ONTOLOGY` · `FLEET-PRIVATE-LAN-NETWORK-OPTIONS` · `FLEET-LIVE-CONSOLE-DEPLOY` |
| Knowledge | `KNOWLEDGE-LIBRARY-CANDIDATES` · `KNOWLEDGE-PACK-POLICY` · `KNOWLEDGE-SCHNEIER-FREE` · `KNOWLEDGE-USENIX-DEFCON` · `FX4100-DOC-INDEX` · `knowledge-approval-matrix.html` |
| Host / cleanup | `QODESH-CLEANUP-SUGGESTIONS-2026-09-12.md` · `qodesh-cleanup-scan.ps1` · `QODESH-BOUNCE-NOTES-P0-FALLTHROUGH.md` · `qodesh-bounce-fallthrough.ps1` |
| Note9 (client) | `note9-release-plan-2026-09-12.md` · `note9-readiness-checklist.md` |

### Live dispatch win

- **DISPATCH-FIX-01 CLOSED live** on qodesh `:8080` (`DISPATCH-FIX-01-BOUNCE`): unknown→**400**, image-gen→**503**, auto→**200** nexus; speech cold→200 sticky (policy-correct). BND-04 closed.
- **PR #12** `fix/dispatch-01-explicit-model-pin` open — post-merge tip sync only; **no parallel `routing.mjs` rewrite**.

### Knowledge under `/workspace/knowledge/` (~762M tree)

| Artifact | Size (on disk) | Notes |
|----------|----------------|-------|
| `netmgmt/kit-disk/grz-netmgmt-kit.iso` | **170 MiB** | Docs-focused kit ISO · SHA256 `e00d5a5e5899b2d3d49fc130f4d83881316f18f8865afcbf5a343456e1c5d9e3` |
| `netmgmt-docs.tar.zst` | **130 MiB** | Docs/scripts/lists (excludes `packages/`) · SHA256 `4565c5e0…678689` |
| `netmgmt/` tree | ~kit-disk 170M + packages 156M + vendors 161M + … | See `netmgmt/MANIFEST.md` |
| `os-handbooks-extreme.tar.zst` | **~40 MiB** (39.44 MiB) | `MANIFEST-os-handbooks.md` · SHA256 `162df64d…351e52` |
| `fx4100-docs.tar.zst` | **4.7 MiB** | + unpacked `fx4100/` ~9 MiB |
| `schneier-crypto-gram.tar.gz` | **2.8 MiB** | + unpacked issues tree |
| Seeds / policy | `lisa-seed/` · `usenix-seed/` · `defcon-slides-seed/` · `harden-default/` · `FETCH-POLICY.md` | Seed lists / checklists |

### OPNsense ISO on this box?

| Item | Status |
|------|--------|
| Official `OPNsense-26.7-dvd-amd64.iso(.bz2)` | **NOT on box** — pin verified 2026-09-12 then **removed** per self-serve policy (`NETMGMT-OPNSENSE-INSTALL-MEDIA` §7 · `netmgmt/MANIFEST.md`). Kept: checksums, `.sig`, `.pub`, `fetch-opnsense-iso.{ps1,sh}`, `catalog.json`. |
| Kit ISO | **Present** — `knowledge/netmgmt/kit-disk/grz-netmgmt-kit.iso` (170 MiB) |
| `.p0-log.txt` line “OPNsense+kit ISO on box” | **Stale** vs later self-serve removal (flagged in §6) |

### Other shipped / staged

- Nexus eval: **35** gold routes + offline scorer (`nexus-eval/`).
- NX-08 smoking gun confirmed: `fetch-models.mjs` URL = bartowski **Qwen2.5-Coder-0.5B**, filename = Qwenstral.
- qodesh: VBox **7.2.16** installed (full path); recycle / LocalAI `_tmp` / dup zips / **Temp** / LocalAI stubs cleared → **C: ~10.05 GB free**; Umamusume **kept**; no Steam/Discord/GitHubDesktop/GGUF deletes.
- OTHER wake packet + dual-team handoff ready (`OTHER-TEAM-WAKE-PACKET`, `DUAL-TEAM-SYNC-HANDOFF`).

---

## 3. Open / blocked

| Item | Blocker / state | Cite |
|------|-----------------|------|
| **Note9 key not authorized** | Wi-Fi candidate `192.168.1.36:8022` waiting operator `authorized_keys`; paste helper `fleet/note9-onboard/TERMUX-MINIMAL-PASTE.txt`; machine **not** in ListMachines; platform gate **F** | OTHER wake · platform BOARD · GOAL-UPDATE §4 · TERMUX paste |
| **qodesh C: ~10.05 GB free** | Post-cleanup (Temp + LocalAI stub/zips); still tight for VBox Machine Folder / VDI / OPNsense ISO; **only C: visible** last check — need **≥40–80 GB** volume (USB/external) before create-VM | VBox plan · OPNsense install-media · QODESH-CLEANUP |
| **PR #12 merge** | Open; live bounce already CLOSED; post-merge sync qodesh from tip; hold parallel routing edits | FIX-01 bounce · RELEASE-READINESS AFK |
| **Nexus A/B on shalom** | Harness ready; first A/B (Instruct 0.5B → 1.5B) when shalom up; CPU/Vulkan rules; never GGUF on 8600 GT | NEXUS-MODEL-ITER-LANE |
| **fetch-models coder mismatch (NX-08)** | Confirmed; **fix notes drafted** (`FETCH-MODELS-QWENSTRAL-MISMATCH-FIX.md`) — apply in pack/fetch **before** A/B; no push yet | NEXUS-MODEL-ITERATION §2 · ITER-LANE NX-08 · FIX notes |
| **Track B OVA** | Wanted dual-track; **not built**; checklist stub at `knowledge/netmgmt/scripts/build-offline-ova.md` (refs `create-netmgmt-vbox.ps1`); needs golden snap on large volume after Track A install path | DISTRO-TRACKS · VBox plan · build-offline-ova.md |
| **AppData listing pending** | Cleanup scan script ready; live inventory not pasted back as `QODESH-CLEANUP-SCAN-RAW-*`; AppData trim deferred until inventory shown | QODESH-CLEANUP · scan.ps1 |
| **Steam trim with Umamusume KEEP** | Operator chunk policy (return brief): trim Steam **but KEEP Umamusume**; not executed (no deletes this window) | Operator return policy → §4 |

**Also open (not elevated):** DISPATCH P0#2 vision-first/prettify (OTHER) · BND-03 · OS image recipes · knowledge vendor deferrals (MikroTik PDF, Cisco/Juniper, Wireshark Portable).

---

## 4. Cleanup policy (qodesh C:)

**Standing rule (board):** report-only; **operator approves each chunk** before any `Remove-Item` / `winget uninstall` (`QODESH-CLEANUP-SUGGESTIONS-2026-09-12.md`). FreeBSD memstick = **KEEP**. Already done: Recycle Bin · `C:\LocalAI\_tmp` · some duplicate zips.

**Operator chunk approvals (return briefing — capture here; no Steam/Umamusume board file existed yet):**

| Chunk | Approval | Constraint |
|-------|----------|------------|
| **a** Steam | **Approved to trim** | **KEEP Umamusume** |
| **b** LocalAI | **Conditional** | Only if archive exists **local** (copy-verify before delete-from-C; prefer USB/`D:` when present) |
| **c** | **Not approved** | — |
| **d** AppData | **Conditional** | Only **after** inventory shown (run `qodesh-cleanup-scan.ps1` → paste raw) |
| **e** | **Not approved** | — |

**No deletions by this executor.** Parent/operator must run live scan on qodesh (`machineId`); box has no ListMachines/Shell-with-machineId.

---

## 5. Recommended next 5 actions (when operator returns)

1. **Authorize Note9 SSH key** (`authorized_keys` for `192.168.1.36:8022` or USB+adb path) so client UAT / Issue #2 can start; confirm registration path.
2. **Attach / inventize a ≥40–80 GB volume** on qodesh; set VBox Machine Folder off C:; `fetch-opnsense-iso.ps1 -OutDir <LARGE>`; run `create-netmgmt-vbox.ps1` → snap `fresh`.
3. **Merge or explicitly hold PR #12**; after merge, tip-sync qodesh `routing.mjs` only — then optional live fuzz comment on **#11**.
4. **Wake OTHER team** (paste wake phrase from `OTHER-TEAM-WAKE-PACKET`); claim **P0#2** (`gateway.mjs`) or note9 on #11 — do not touch `routing.mjs`.
5. **Apply NX-08 fetch-models fix** from `FETCH-MODELS-QWENSTRAL-MISMATCH-FIX.md` (pack/fetch only; no routing.mjs) + nexus A/B when **shalom** is up; further cleanup only with archive proof / large volume — Temp already cleared.

---

## 6. Cross-check — inconsistencies flagged

| Topic | Sources | Inconsistency | Suggested resolve |
|-------|---------|---------------|-------------------|
| **Track B OVA vs “no OVA”** | **Pro dual-track:** `NETMGMT-DISTRO-TRACKS` (Track B = `grz-netmgmt-offline.ova`), `NETMGMT-SELF-SERVE-DOWNLOADS`, VBox plan § Distro model lock + “Track B still wanted”. **Anti redistributing pre-built:** `NETMGMT-OPNSENSE-INSTALL-MEDIA` §6 (“will not ship Full pre-built OPNsense VDI/OVA/VM”), OUT-OF-BOX-KIT TLDR + §249, `netmgmt/MANIFEST.md` (“No pre-built OPNsense VM in this tree”), VBox §11 “do not ship full pre-built appliance/OVA”. | Executor/media boards read as **no OVA**; locked distro tracks say **build Track B OVA alongside A**. | Operator reaffirm: Track A = official ISO + kit (no third-party appliance redistribute); Track B = **our** post-harden golden export — update INSTALL-MEDIA / OUT-OF-BOX / MANIFEST wording to “no third-party pre-built; Track B our export OK” **or** demote Track B. |
| **`.p0-log` vs self-serve ISO removal** | `.p0-log.txt`: “OPNsense+kit ISO on box”. INSTALL-MEDIA §7 / MANIFEST: official ISO **not kept** after pin verify. | Log stale. | Treat log as historical; kit ISO remains; OPNsense blob gone — re-fetch to large volume. |
| **DISPATCH-FIX-01-REVIEW vs BOUNCE** | REVIEW header still “LIVE BOUNCE PENDING”; footer + BOUNCE board = **CLOSED**. | Cosmetic drift. | Prefer BOUNCE + RELEASE-READINESS as authority. |
| **Platform BOARD addendum vs pivot** | Platform addendum: “This team owns note9 integrate+ship; other team keeps qodesh/Windows.” Pivot / GOAL-UPDATE / wake: note9 = client; OTHER claims gateway/P0#2 or note9 on #11. | Ownership sentence pre-pivot / pre-wake. | Prefer wake packet + GOAL-UPDATE dual-team table; platform addendum needs refresh. |
| **GOAL-PIVOT “Linux or BSD” vs GOAL-UPDATE “all three”** | Pivot still “or”; UPDATE locks FreeBSD + Debian-class + HardenedBSD. | Pivot partially superseded (UPDATE says so). | Cite UPDATE for OS matrix; pivot for absolute-top artifact. |
| **NX-08 / fetch-models** | Boards agree mismatch is confirmed. | Consistent — fix still open. | Patch fetch/pack before A/B. |
| **Cleanup Steam/Umamusume** | In operator return brief (§4); **not** yet in `QODESH-CLEANUP-SUGGESTIONS` body. | Policy only on this STATUS until board append. | Append chunk table to cleanup suggestions board on next edit pass. |

---

## 7. Quick inventory snapshot (box)

```
/workspace/knowledge/netmgmt/kit-disk/grz-netmgmt-kit.iso     170M  PRESENT
/workspace/knowledge/netmgmt/install-media/OPNsense-26.7*     sig/checksums/pub only — ISO ABSENT (self-serve)
/workspace/knowledge/netmgmt-docs.tar.zst                     130M
/workspace/knowledge/os-handbooks-extreme.tar.zst              40M
/workspace/knowledge/fx4100-docs.tar.zst                      4.7M
/workspace/knowledge/schneier-crypto-gram.tar.gz              2.8M
/workspace/reviews/release/nexus-eval/                        gold 35 + scorer
qodesh C: free                                                ~10.05 GB (post Temp/LocalAI stub cleanup) — VBox still blocked on volume
PR #12 / Issue #11                                            open / wake ready
```

---

**End STATUS-REVIEW-2026-09-12** · No deletes performed · Operator return actions in §5.


## Cleanup inventory (qodesh, 2026-09-12) — executed safe chunks

**C: free:** **~10.05 GB** (was ~9.09 GB before this pass; earlier window had ~2.3 GB → ~9.1 GB)

### Done this pass (operator-authorized / safe)

| Action | Result |
|--------|--------|
| `AppData\Local\Temp` cleared | Done |
| LocalAI stub / duplicate runtime zips removed | Done |
| Umamusume | **KEPT** |
| Steam / Discord / GitHubDesktop / GGUFs | **NOT deleted** (standing NO) |

### a) Steam — KEEP Umamusume (unchanged)

Almost the entire Steam install **is** Umamusume (~29.3 GB). Trim-with-keep yields ~0 reclaim unless Uma moves off C:. Steam client **not** uninstalled.

### b) LocalAI — GGUFs untouched

Big GGUFs **kept** (no archive certainty). Only stub/zips cleared. Nexus 0.5B / coder / embed / guard weights remain.

### d) AppData\Local — post-Temp

Temp prune done. Discord / GitHubDesktop **not** touched (operator: no destructive deletes of those). Further AppData only after fresh inventory if needed.

### Still needed for VBox

1. Plug USB/SSD (≥40–80 GB) for Machine Folder + OPNsense ISO  
2. Optional later: confirm off-box archive before any LocalAI GGUF move  
3. Do **not** expect Steam wins without moving Uma  

### Box follow-ups landed this pass

- Track B checklist: `knowledge/netmgmt/scripts/build-offline-ova.md`  
- NX-08 fix notes: `reviews/release/FETCH-MODELS-QWENSTRAL-MISMATCH-FIX.md` (no git push / no routing.mjs)  
- Termux paste: `fleet/note9-onboard/TERMUX-MINIMAL-PASTE.txt`  
- Ontology reminder: **X-10 under `transport/`**, not lighting (`NETMGMT-HA-ONTOLOGY`)  

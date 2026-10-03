# Goal update — 3 OS lines + Note9 VM ship target — 2026-09-12

**Authority:** operator decisions 2026-09-12  
**Supersedes (partial):** pick-one OS framing in `GOAL-PIVOT-2026-09-12.md` and open Q1 / Phase C “OS pick” in `OFFLINE-SECURITY-WORKSTATION-PLAN-2026-09-12.md` §2 / §7 / §9.  
**Does not replace:** absolute-top ship artifact (offline security workstation IMAGE with Green-Roomz + defensive suite + fleet model packs); dispatch P0 freeze gate; hard rules (defensive only · no plaintext creds · no push unless asked · dual-team ownership with Researcher `09f2d365…`).

**Companion plan (light append only):** `OFFLINE-SECURITY-WORKSTATION-PLAN-2026-09-12.md` §10  
**Knowledge library:** **separate track** — landed **`/workspace/reviews/release/KNOWLEDGE-LIBRARY-CANDIDATES-2026-09-12.md`**. Do **not** entangle that board into image freeze or this matrix.

---

## 1. Operator decisions (locked)

| # | Decision | Was | Now |
|---|----------|-----|-----|
| D1 | OS bases | Pick FreeBSD-line **or** Linux-line (HardenedBSD optional) | **ALL THREE** ship lines in parallel: **FreeBSD/pqfreebsd**, **Debian-class hardened Linux**, **HardenedBSD** |
| D2 | Note9 role | Client / UAT only (Termux phone-native); not release cut brand | **Note9 VM is a ship target** (guest image / VM profile) **in addition to** phone-native Termux client track |
| D3 | Knowledge library | — | **Out of band** — board landed (`KNOWLEDGE-LIBRARY-CANDIDATES-2026-09-12.md`); not a gate on image matrix |

---

## 2. Image matrix implications

Ship planning must cover **3 bases × (workstation host + Note9 VM guest)** — not a single golden ISO.

| Base | Workstation image (x86_64 airgap kit) | Note9 VM guest (ship target) | Notes |
|------|----------------------------------------|------------------------------|-------|
| **FreeBSD 15 / PQFreeBSD** | Primary BSD workstation kit (Capsicum/MAC / jail story) | Guest profile for Note9 VM bring-up on this base where feasible | Aligns godslove #5 / `pqfreebsd` inventory; BSD adapters still needed |
| **Debian-class hardened Linux** | Primary Linux workstation kit (broadest tool + model-pack logistics) | Guest profile for Note9 VM (likely easiest Node/llama guest path) | CIS-ish / default-deny; treat Ubuntu LTS as Debian-class variant if used |
| **HardenedBSD** | Third workstation kit (hardened defaults) | Guest profile for Note9 VM on HardenedBSD | **In-cut** now (no longer “only if explicitly picked”); expect ports/Node lag risk |

**Matrix cardinality (planning):** 3 OS bases × 2 roles = **6 image/recipe tracks** (workstation + Note9 VM guest per base). Shared payload (Green-Roomz tip, defensive suite categories, model-pack tiers) stays common; OS packaging / first-boot / guest virt differ per cell.

**Still true:**

- Windows **qodesh / shalom** remain **build/dogfood** hosts — not the released OS image brand.
- Phone-native **Termux** on Note9 remains a **client / Issue #2 UAT** track (T0 resident router only) — **orthogonal** to Note9 **VM** ship target.
- Absolute-top artifact remains the **offline workstation IMAGE** family; Note9 VM is an **additional** ship cell, not a reversion to note9-as-sole-brand.

**Freeze impact:** image freeze no longer waits on a single OS pick. It waits on **dispatch P0** + per-base recipe readiness (can stage/ship bases asynchronously if operator accepts staggered cuts).

---

## 3. Dual-team ownership implications

| This team (active SuperGrok / box — image matrix + dispatch P0) | Other Researcher `09f2d365…` (Windows · shalom on wake) |
|-----------------------------------------------------------------|--------------------------------------------------------|
| Own this GOAL-UPDATE + matrix boards; append-only on workstation plan | Append dated addenda only; no in-place plan rewrites |
| Draft / coordinate **3-base** image recipes + Note9 VM guest profiles | qodesh dirty-tree audit; Windows Unicorn / fetch-models dogfood |
| Dispatch P0/P1 integrate (gateway/routing/nexus/monitor) | Avoid simultaneous `src/gateway.mjs` edits |
| Model-pack strategy + matrix sizing (T0–T3 across cells) | May own large download/fill on shalom when online |
| Note9 **VM** ship-cell docs + UAT against qodesh USB+adb path | Stay off `agents.note9.json` / note9 scripts unless handed |
| Phone Termux Issue #2 as **client** track (not brand) | Same collision rule |
| Knowledge-library board landed (`KNOWLEDGE-LIBRARY-CANDIDATES-2026-09-12.md`); keep out of image freeze | Same — do not entangle into Windows/download freeze path |
| pqfreebsd + HardenedBSD **both** in matrix (not pick-one) | Own godslove #5 bring-up when FreeBSD box exists |
| **No push** unless operator asks | Same |

**Collision rule unchanged:** one integrator for gateway/council/Brainz seam/`main` pushes; communicate via `/workspace/reviews/*`.

---

## 4. First-connect path (Note9)

| Fact | Implication |
|------|-------------|
| **ListMachines** shows **qodesh** and **shalom** only — **note9 is not registered** | Do not plan local-exec / ListMachines routes to note9 |
| Preferred first connect | **USB + adb from qodesh** (Allow on host is operator action; forensic “USB unauthorized” claim unverified until live enum) |
| Role of path | Bring-up / UAT for phone-native client **and** conduit to exercise Note9 VM guest work from the Windows dogfood host |
| Peer/tunnel | Remains **design-only** until allowlist+key UAT; not required for first connect |

---

## 5. Open questions (narrowed)

Closed by this update: single OS pick (Q1 style) — **all three**.  
Still open: staggered vs simultaneous freeze per base; exact Note9 VM hypervisor/host (qodesh vs kit workstation); medium (USB SSD / hybrid ISO); build host under dirty-tree / shalom-offline constraints; whether godslove #5 adapters are in-cut for FreeBSD **and** HardenedBSD cells.

---

## Document control

| Field | Value |
|-------|-------|
| Created | 2026-09-12 |
| Method | Operator decision capture → matrix + ownership + connect-path implications |
| Cross-link | Appended §10 on `OFFLINE-SECURITY-WORKSTATION-PLAN-2026-09-12.md` |
| Separate track | Knowledge library → `KNOWLEDGE-LIBRARY-CANDIDATES-2026-09-12.md` (landed) |

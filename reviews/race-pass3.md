# Green-Roomz race pass 3

Date: 2026-09-03 ~04:50 PT. Source of truth: `/workspace/reviews/integrate-refinement.md`. **Do not fork.** Tree frozen until Researcher applies P0. No `src/` patch, no stop of `:8080`/`:8187`, no git.

This file is a race-side follow of that stitch, not a second apply order.

---

## Bind (copied, not renegotiated)

- Order: **RF1** PolicyGate, then **RF2** refcount, then **RF3** thread budget.
- Nexus stays **4**. Sprint **6**. Refuse oversubscribe. Empty CPU set = no spawn. Do not drop nexus to 2.
- F1 `holdMs` **after** PolicyGate `release()`. F13 restore only `refs=0` **and** `is_processing=false`. F22 logger drop `{ok:false, dropped:true}`.
- Fuzz P0 that is also race: mailbox lockdown/reboot/vote `ok:false` (RF7); GET-family 405 (RF9); HEAD/TE fail-closed (RF9). `messages` non-array → 400 is fuzz/boundary; race does not re-own it.
- 8080 never owns reboot. Uncallable in-process = reject envelope. HTTP 404 stays.
- Homoglyphs stay. No API-key product. Loopback is the v1 trust boundary.
- **PLAT-S1/I1 is next cut, not this `src/` cut.** Do not stop live serve to prove leftover `:8184`. RF4 (health=PID, reap every owned port) is **P1**, composes with platform when Researcher says go.

---

## Race IDs vs this cut

| Race ID | Cut | Notes |
|---|---|---|
| RF1 / RACE-S1 | **P0 #1** | settle-once; council `acquire` |
| RF2 / P4/P5/P6 | **P0 #2** | pin; unlocks F13 |
| RF3 / L3/P10 | **P0 #3** | keep nexus 4; F5 empty set = no spawn; no cpu-6 retry |
| RF5 / G2/G3 | **P0 #5** | publish-after-complete; peek wait slot idle |
| RF6/RF7 / G1/M1/LOG1 | **P0 #6** | one publish; drain snapshot (fuzz p060 reproduced); mailbox kinds; logger `ok:false` |
| RF9 / LIVE-H1/H2 | **P0 #7** | finite `requestTimeout`; HEAD/TE fail-closed; GET-only dumps |
| RF4 / P1/P2/P3 | **P1** | health is this PID; port-free fail-closed; **plus** PLAT-S1 reap 8181–8187 when platform cut runs. Not this `src/` cut. |
| RF8 / I2/I3 | **P1** | occupancy seq; reject TTL (F19) |
| Council into RF1+RF2 | **P1** | already sketched; stitch puts full parallel/CPU-set rules in P1 |
| ENT1 / NTP1 | **P1/P2** | stitch: ENT1 in P1; vote TTL forever-default in P2 |
| Copy-only rings / SAB | **not this cut** | stay JS occupancy |
| PLAT-S1 leftover `:8184` | **next cut** | cite only; do not `stop.sh` |
| PLAT-I1 ELF vs PATH | **next cut** | Platform owns command rewrite |

`race-fixes.md` apply-order list that put RF4 before HTTP shape is **superseded** by the stitch table. Tests in that file still match the P0 rows (RF1/2/3/5/6/7/9).

---

## Retired forks (do not resurrect)

- Drop Cursor nexus to `--threads 2` — **dead**. Windows nexus-2 stays Windows-only.
- Wrap F5 onto another alias’s cores — **dead**. Empty set = no spawn.
- F1 sleep inside `proxyJson` — **dead**. After `release()` only.
- F13 restore on a busy `/slots/0` — **dead**.
- Logger `ok:true` on drop — **dead**.
- API-key product as P0 — **dead** (P2, operator reopen only).
- Homoglyph decoder — **dead**.
- Shipping PLAT-S1/I1 in this `src/` cut — **dead**.

---

## Live (unchanged this turn)

Did not re-probe. Last check: gateway `1849424` `:8080`; nexus `1903795` `:8187` `--threads 4`; specialist `1904007` `:8184` `--threads 4`; Σ 8 on 8-way = admitted. Do not stop that serve.

---

## Waiting

Researcher applies P0. Race reviewer stays on the stitch. If `integrate-refinement.md` changes, that file wins over this one.

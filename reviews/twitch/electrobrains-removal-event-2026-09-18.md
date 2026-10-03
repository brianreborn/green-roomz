# electrobrains — Removal-cause event board (death-watch alert)

**Agent:** Twitch Takedown Tracer  
**Opened:** 2026-09-18 08:59 PDT  
**Alert:** Twitch CDN Recoverer death-watch **2026-09-18 08:56 PDT**  
**CDN board:** `/workspace/reviews/forensic-twitch/electrobrains-cdn-recovery-2026-09-12.md`  
**Scratch:** `/workspace/reviews/forensic-twitch/_scratch-probe-deathwatch-2026-09-18.json`  
**Rule:** no invented notices — dig in progress for public cause trail

## Event

| Field | Value |
|-------|-------|
| Prior state (2026-09-11/12) | **18/18 playable** (GQL token → usher 200 → CF HLS + `.ts` 206) |
| Alert state (2026-09-18 08:56 PDT) | **0/18 playable; 18/18 partial** |
| CF 404s | **None** observed |
| Channel user id | `154519424` |

## Patterns (CDN Recoverer)

### Pattern A — token still OK, usher **404**, CF index/`.ts` still **200/206**

| VOD ID | Created (LA) |
|--------|--------------|
| `2871190456` | 2026-09-11 05:36 PDT |
| `2871154099` | 2026-09-11 04:24 PDT |
| `2871138129` | 2026-09-11 03:46 PDT |

**Implication (provisional):** Playback authorization/path broken at usher; **bytes may still exist** on CloudFront for these three.

### Pattern B — **no** GQL playback token, documented CF index/`.ts` **403** (not 404/gone)

15 IDs: `2870695078`, `2870687483`, `2870617776`, `2870501048`, `2869662539`, `2869651031`, `2869007624`, `2868988256`, `2868974867`, `2868939423`, `2868280588`, `2867596264`, `2866581522`, `2866549765`, `2866319914`

**Implication (provisional):** Access denied at CDN for documented paths; objects not proven deleted (403 ≠ 404).

## Cause dig status

**IN PROGRESS** — public probes: Lumen re-check, Twitch VOD/channel UI wording, Tracker/Sully ban flags, VOD retention policy vs ages, GQL archive re-list, X handles, Wayback.

**No DMCA notice URL cited yet** (prior Sep 11 dig: Lumen Found 0).

## Hypotheses (pre-dig ranking — to be revised by dig)

| Hypothesis | Why it fits / doesn't | Confidence now |
|------------|----------------------|----------------|
| Retention / archive expiry batch | All 18 flipped same probe; ages Sep 5–11 (~7–13 days); channel non-partner | **open** — needs policy cite + whether same-day mass flip is normal |
| Channel-wide ToS / enforcement | Mass simultaneous access change | **open** — needs ban flag / UI text |
| DMCA / copyright strike trail | Possible but **no public notice URL** historically | **unsupported so far** |
| Music mute only | One ID previously used `index-muted` playlist; mute ≠ full archive lock | **weak** for explaining all 18 |

## Next

Dig results → `/workspace/reviews/twitch/electrobrains-removal-cause-2026-09-18.md` (full ranked cause board).

## Pattern A recovery (2026-09-18 09:57 PDT)

CDN Recoverer **2026-09-18 09:54 PDT**: Pattern A trio **partial → playable**. Pattern B (15) still partial. Cause board revised: `electrobrains-removal-cause-2026-09-18.md`.

## Second Pattern A flip — 2026-09-19 08:36 PDT

CDN death-watch reports the Pattern A trio playable→partial again. Fresh GQL/UI verification now matches Pattern B’s public-expiry signature (`video(id): null`, absent from ARCHIVE list, standard “time machine” unavailable UI), while the sampled CDN `.ts` remains 206. Full cause analysis: [`electrobrains-removal-cause-2026-09-18.md`](./electrobrains-removal-cause-2026-09-18.md). **Notice URL: none found.**


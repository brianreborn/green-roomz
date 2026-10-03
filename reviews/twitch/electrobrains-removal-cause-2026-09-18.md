# electrobrains Twitch — Removal Cause Dig (2026-09-18)

**Agent:** Twitch Takedown Tracer (read-only forensic)  
**Written:** 2026-09-18 ~09:10 PDT  
**Channel:** `electrobrains` (Twitch user id `154519424`)  
**Trigger:** CDN Recoverer death-watch — all 18 ARCHIVEs flipped playable→partial at **2026-09-18 08:56 PDT**  
**CDN board:** `/workspace/reviews/forensic-twitch/electrobrains-cdn-recovery-2026-09-12.md`  
**Raw probe:** `/workspace/reviews/forensic-twitch/_scratch-probe-deathwatch-2026-09-18.json`  
**Rule:** no invented DMCA notices / notice IDs / strike counts — cite sources only  

---

## Event timeline (America/Los_Angeles)

| When (PDT) | What | Source |
|------------|------|--------|
| 2017-04-25 | Channel created | TwitchTracker https://twitchtracker.com/electrobrains ; SullyGnome https://sullygnome.com/channel/electrobrains |
| 2026-09-05 14:19 → 2026-09-11 05:36 | 18 ARCHIVEs titled “just security” recorded (Politics) | Prior GQL inventory in `electrobrains-takedown-lumen-x.md` |
| 2026-09-11 ~17:27–17:42 | Baseline dig: Lumen **Found 0**; Tracker/Sully **no ban**; **18/18 playable** on CloudFront | `electrobrains-takedown-baseline.md`, `electrobrains-takedown-lumen-x.md`, CDN board |
| 2026-09-12 | Death-watch still covering all 18 as playable (prior probe set) | CDN board change log / prior scratch |
| 2026-09-15–17 | Channel continues streaming; **new** ARCHIVEs created (still under 7-day window) | GQL `user.videos(type:ARCHIVE)` this dig |
| **2026-09-18 08:56 PDT** | **Death event:** CDN Recoverer probe marks **18/18 partial** (Pattern A + B below) | CDN board + `_scratch-probe-deathwatch-2026-09-18.json` |
| 2026-09-18 ~09:00–09:10 PDT | This cause dig: UI / GQL / Tracker / retention policy / X / Wayback / Lumen attempt | this file; screenshots under `/workspace/reviews/twitch/_scratch/` |

---

## Pattern A vs Pattern B

From CDN Recoverer (given) + this dig’s UI/GQL corroboration.

| Dimension | Pattern A | Pattern B |
|-----------|-----------|-----------|
| VOD IDs | `2871190456`, `2871154099`, `2871138129` | `2870695078`, `2870687483`, `2870617776`, `2870501048`, `2869662539`, `2869651031`, `2869007624`, `2868988256`, `2868974867`, `2868939423`, `2868280588`, `2867596264`, `2866581522`, `2866549765`, `2866319914` |
| Created (PDT) | 2026-09-11 03:46–05:36 | 2026-09-05 14:19 – 2026-09-10 14:07 |
| Age at death (08:56 PDT) | **~171–173 h (~7.1–7.2 d)** — all **past 7d** | **~187–307 h (~7.8–12.8 d)** — all **past 7d** |
| GQL playback token (CDN probe) | **True** | **False** |
| Usher | **404** | not attempted (no token) |
| Documented CF index / sample `.ts` | **200 / 206** (still on disk) | **403 / 403** (not 404) |
| GQL `video(id)` now | Still returns `status: RECORDED` | **`null`** (metadata gone) |
| GQL `user.videos(ARCHIVE)` list | Still listed (3 of 11 current archives) | **Dropped** from list |
| Twitch VOD page UI (CDP 2026-09-18 ~09:04 PDT) | Title **“just security - Twitch”**; metadata “**7 days ago** … Politics · 11 views”; player chrome visible; **no** DMCA / ToS / muted / login-wall error text | Exact text: **“Sorry. Unless you've got a time machine, that content is unavailable.”** + “Browse channels”; page title generic “Twitch” |
| Screenshot | `/workspace/reviews/twitch/_scratch/vod-A-2871190456.png` | `/workspace/reviews/twitch/_scratch/vod-B-2870695078.png`, `vod-Bm-2870501048.png` |
| Special note | Soft/transition expiry: metadata + residual CF bytes remain; usher path dead | Harder purge of public metadata + CF ACL 403; same UI copy Twitch uses for expired/deleted VODs |
| Music mute | N/A this dig | `2870501048` previously used `index-muted-*.m3u8` (music mute path ≠ DMCA strike); now same Pattern B expiry UI / GQL null |

**Channel page (same probe):** https://www.twitch.tv/electrobrains — title “electrobrains - Twitch”; **OFFLINE**; “2 followers”; recent broadcasts from **2 days ago** still advertised; **no** ban/suspension chrome. Screenshot: `_scratch/channel-electrobrains.png`.

---

## Competing hypotheses (ranked)

| Rank | Hypothesis | Confidence | What supports | What does **not** support / caveats |
|------|------------|------------|---------------|-------------------------------------|
| **1** | **Non-affiliate past-broadcast retention expiry batch (~7 days)** | **High (~0.85)** | Channel `roles.isPartner: false`, `isAffiliate: false` (GQL). Official policy: non-Affiliate/non-Partner/non-Prime/non-Turbo past broadcasts kept **7 days** then deleted — https://help.twitch.tv/s/article/video-on-demand . All 18 original IDs were **>7 days old** at 08:56 PDT. Mass same-day flip fits a retention sweeper. Pattern B UI is Twitch’s standard **“time machine… unavailable”** copy (expiry/delete), not a rights banner. Pattern B dropped from GQL; Pattern A at ~7.1d still soft-present (RECORDED + residual CF) while usher already 404 — consistent with staged expiry. Channel still live-publishing **new** Sep 15–17 archives (under window). | Exact sweeper schedule not observable from outside; Pattern A UI still showed a player frame while CDN marked usher partial — residual CDN vs public player path may diverge during transition. |
| **2** | **Platform bug / CDN–usher inconsistency** | **Low–medium (~0.25)** | Pattern A: token OK + usher 404 + CF still 200/206 is an odd split; could be routing bug. | Does **not** explain Pattern B GQL `null` + “time machine” UI + age alignment with 7-day policy + 15 IDs vanishing from archive list together. New VODs healthy. |
| **3** | **Channel ToS enforcement / ban / wipe** | **Low (~0.10)** | Politics category + “just security” title could attract enforcement interest in theory. | Tracker https://twitchtracker.com/electrobrains — Followers **2**, Created **2017-04-25**, Updated **2026-09-18**, **no Banned/Suspended** label. SullyGnome https://sullygnome.com/channel/electrobrains — Affiliate eligible **No**, Mature **No**, **no ban banner**; “Latest status - just security”. Channel page online; new archives after Sep 11. Ban would not selectively leave only the three newest-of-old IDs in soft state. |
| **4** | **DMCA / copyright strike takedown** | **Very low (~0.05) public evidence** | Cannot rule out a **private** Twitch notice (Twitch rarely publishes channel DMCA into Lumen). | **No notice URL found** this dig (see Lumen section). Pattern B UI is generic unavailability, not a copyright/DMCA interstitial. Music-muted playlist on `2870501048` was already distinguished from strikes. Mass retention-shaped age cut + continued channel publishing argue against a rights strike wiping the window. |
| **5** | **Music mute as cause of death event** | **Ruled out as primary (~0.02)** | Prior muted playlist on one ID. | Mute path ≠ removal; only one ID had muted index; death hit all 18 including non-muted; Pattern B is CF **403** + GQL gone, not muted audio. |

---

## Retention policy vs VOD ages

**Policy (cite):** https://help.twitch.tv/s/article/video-on-demand (and `?language=en_US`) — Twitch Help “On-Demand Content on Twitch”:

- Partners / Prime / Turbo: **60 days** past broadcasts  
- Affiliates: **14 days**  
- **All other broadcasters: 7 days**, then deleted  

**This channel:** not Partner, not Affiliate (GQL); SullyGnome Affiliate eligible **No** → **7-day** bucket.

**Fit:** Sep 5–11 archives → by Sep 18 08:56 PDT every ID is past 7 days (Pattern A by ~3–5 hours; Pattern B by ~1–6 days). Mass same-day flip **fits retention batch**, not selective channel enforcement. New Sep 15–17 VODs remain listed (still inside window).

---

## Lumen / DMCA notices

| Probe | Result | Source |
|-------|--------|--------|
| Prior dig 2026-09-11 | Explicit UI **“Found 0 results”** for `electrobrains`, quoted channel URL, sample VOD IDs | `electrobrains-takedown-lumen-x.md` ; URLs under https://lumendatabase.org/notices/search?term=… |
| This dig (Anubis PoW) | Anubis challenge solved (`response`=hash); then **reCAPTCHA** `captcha_gateway` / CDP cookie denial blocked a fresh Found-N scrape | session notes; `_scratch/lumen-*.png` show Anubis “Oh noes!” cookie error in headless CDP |
| Web index | No electrobrains-specific Twitch DMCA/Lumen hit | WebSearch synthesis 2026-09-18 |

### Explicit notice URL finding

**none** — no electrobrains / `twitch.tv/electrobrains` / sample-VOD notice URL to cite from this dig or the Sep 11 Found-0 pass.

Caveat (unchanged): absence from Lumen ≠ proof no private Twitch notice exists.

---

## Tracker / SullyGnome ban flags (NOW vs prior)

| Source | Prior (Sep 11) | Now (Sep 18 ~09:00 PDT) |
|--------|----------------|-------------------------|
| https://twitchtracker.com/electrobrains | No ban/suspension flag; Followers 2; Created 2017-04-25 | **Still no Banned/Suspended** text/class; Followers **● 2**; Created **2017-04-25 04:17:15**; Updated **2026-09-18 15:59:33** (UTC stamp on page = 08:59 PDT) |
| https://sullygnome.com/channel/electrobrains | No ban banner; Affiliate eligible No | **Same:** Followers **2**, Affiliate eligible **No**, Mature **No**, Created **25th Apr 2017**, status “just security” |

**Implication:** No public ban/suspension flip accompanying the VOD death event.

---

## GQL ARCHIVE list (re-check)

| | Sep 11 dig | Sep 18 this dig |
|--|------------|-----------------|
| Count | **18** (complete; `hasNextPage: false`) | **11** (`hasNextPage: false`) |
| Overlap with death-watch 18 | all 18 | **only Pattern A three** remain |
| Status of remaining | `RECORDED` | Pattern A still `RECORDED`; Pattern B `video(id)` → **null** |
| New IDs | — | `2876220917`, `2875903541`, `2875900029`, `2875298153`, `2875289627`, `2875284614`, `2874917632`, `2874677451` (Sep 15–17 PDT) |
| Roles | not partner | `isPartner: false`, `isAffiliate: false`, followers **2**, `stream: null` |

Client-Id used (public web): `kimne78kx3ncx6brgo4mv6wki5h1ko` (read-only).

---

## X (read-only)

| Handle | Result | Screenshot |
|--------|--------|------------|
| https://x.com/BrianReborn_alt | Profile loads (“Commentary account”); recent visible posts (e.g. Sep 14 pin, ~5h Russian-language aesthetic post). Keyword scan of scraped body: **no** twitch / DMCA / VOD / strike / takedown / delete / electrobrains / copyright / muted | `_scratch/x-BrianReborn_alt.png` |
| https://x.com/born_brian85001 | Profile loads; pinned Quiet Zones / Isaiah bio material. Same keyword scan: **no** Twitch-delete/strike talk in visible recent text | `_scratch/x-born_brian85001.png` |

Public X search not re-run as authenticated search (login-walled historically); profile recent-feed only — **medium** confidence for “no chatter,” not full-history proof.

---

## Wayback / Internet Archive

| Probe | Result |
|-------|--------|
| CDX `www.twitch.tv/electrobrains` | **3 rows**, all **2022-01-06/07** channel homepage (same as Sep 11 dig). https://web.archive.org/cdx/search/cdx?url=www.twitch.tv/electrobrains&output=json&limit=20 |
| CDX sample VOD URLs (`2871190456`, `2870695078`, `2866319914`) | Empty `[]` and/or TLS timeouts this turn — **no archived VOD pages** confirmed |

No Wayback evidence of a rights-takedown interstitial on these VOD URLs.

---

## Implications for abusive / illegal takedown trail

- **Public trail does not support an abusive DMCA or ToS-strike narrative for this death event.** The shape matches **routine 7-day non-affiliate VOD retention expiry**: age cut, standard “time machine” unavailability copy, channel still open and streaming, no Tracker/Sully ban, no Lumen notice URL.
- **Lack of a notice URL** means there is **no citable third-party DMCA artifact** tying `electrobrains` to this flip. That is **evidence of absence in public indexes**, not a courtroom negative of private notices.
- Residual Pattern A CF **200/206** while usher **404** is a **recovery window for CDN Recoverer**, not proof of foul play.
- Continue death-watch on Pattern A until CF goes 403/404; cause board should only escalate to “suspected enforcement” if **newer-than-7-day** VODs die with rights/ToS UI or a real notice URL appears.

---

## Gaps

1. **Lumen live Found-N** this turn blocked after Anubis by reCAPTCHA / headless cookie policy — rely on Sep 11 Found-0 + web index null; retry interactive browser if a notice is suspected.  
2. **Private Twitch creator mail / strike dashboard** not in scope (FI previously: none in possession).  
3. **Exact retention sweeper clock** (hour of day, soft vs hard delete stages) not documented publicly beyond Help article day counts.  
4. **Pattern A player** still rendered a frame in UI while usher returned 404 — need follow-up whether unsigned CF playback still works end-to-end.  
5. **Wayback VOD snapshots** still missing (IA flaky TLS).  
6. **X full history / search** not exhaustively readable without search access.

---

## Coordinate

- CDN Recoverer board remains authoritative for playability bits.  
- Baseline pointer appended: `electrobrains-takedown-baseline.md`.  

**Board path:** `/workspace/reviews/twitch/electrobrains-removal-cause-2026-09-18.md`


---

## Revision — Pattern A recovered (2026-09-18 09:57 PDT)

**From:** Twitch CDN Recoverer probe **2026-09-18 09:54 PDT**  
**CDN board:** `/workspace/reviews/forensic-twitch/electrobrains-cdn-recovery-2026-09-12.md`

| Change | Detail |
|--------|--------|
| Pattern A (`2871190456`, `2871154099`, `2871138129`) | **partial → playable** (token + usher 200 + CF) |
| Pattern B (15 IDs) | Still **partial** (no token, CF 403) |

**Implication:** Revises the 08:56 PDT “18/18 partial” snapshot. Pattern A’s morning usher-404 + residual CF was **transient / staged**, not a hard wipe — consistent with ranked #1 (7-day retention / usher lag). Pattern B remains the hard expiry set. Do **not** treat morning dig as “all archives permanently gone.” Notice URL still **none**. Ban flags still none (prior dig).

**Watch:** Pattern A ages were already ~7.1d at 08:56; they may flip again when retention fully clears them.


---

## Second Pattern A flip (stub — verify in progress) (2026-09-19 08:38 PDT)

**CDN Recoverer alert:** **2026-09-19 08:36 PDT**  
IDs: `2871190456`, `2871154099`, `2871138129`  
**Change:** playable → **partial** (again)  
**CDN detail:** no GQL token; CF index **403**; sample `.ts` still **206** (not 404)  
**Fleet state:** **0/18 playable**, 18/18 partial  
**Prior prediction:** 2026-09-18 09:54 revision noted these ages were past 7d and “may flip again.”  
**Provisional implication:** retention completion / hard step for Pattern A (matches #1). GQL/UI verify pending — do not invent DMCA.

---

## Second Pattern A flip — verified (2026-09-19 08:38 PDT)

**CDN alert:** at **2026-09-19 08:36 PDT**, `2871190456`, `2871154099`, and `2871138129` changed **playable → partial** again. The fresh CDN probe reports no GQL playback token, documented CloudFront index **403**, and the sample `.ts` still **206** (not 404); fleet state is **0/18 playable, 18/18 partial**. Evidence: `/workspace/reviews/forensic-twitch/_scratch-probe-deathwatch-2026-09-19-0833.json` and the CDN board above.

**Fresh public GQL check (read-only, HTTP 200; Client-ID `kimne78kx3ncx6brgo4mv6wki5h1ko`):** `video(id)` returned **null** for all three IDs. `user(id:154519424).videos(type:ARCHIVE)` returned `hasNextPage: false` with eight current `RECORDED` archives — `2876220917`, `2875903541`, `2875900029`, `2875298153`, `2875289627`, `2875284614`, `2874917632`, `2874677451` — and **none of the Pattern A trio remains on the list**.

**VOD UI check:** `https://www.twitch.tv/videos/2871190456` displays: **“Sorry. Unless you've got a time machine, that content is unavailable.”** and “Browse channels.” No rights-specific notice was shown.

**Implication:** This second flip is consistent with **retention completion / the staged hard public-expiry step**, not a new enforcement event. At the GQL/archive-list/UI level, Pattern A now matches Pattern B’s hard-expiry signature (null metadata, absent from ARCHIVE list, standard time-machine UI). The residual `.ts` **206** means CDN bytes are still present on the sampled path, so this is not proof of a physical byte purge. No notice URL was found; do not infer DMCA.


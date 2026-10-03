# electrobrains — Lumen / Wayback / X / tracker dig (dated section)

**Agent:** Twitch Takedown Tracer (read-only)  
**Written:** 2026-09-11 17:40 PDT  
**Channel:** `electrobrains` (Twitch user id `154519424`)  
**Rule:** no invented notices / notice IDs / strike counts — concrete sources only  
**Baseline board kept:** [`electrobrains-takedown-baseline.md`](./electrobrains-takedown-baseline.md)

---

## Executive TLDR

| Probe | Outcome |
|-------|---------|
| Lumen `electrobrains` / quoted / VOD IDs | **ZERO results** (explicit “Found 0 results”) |
| Lumen `twitch.tv/electrobrains` / `electrobrains twitch` (unquoted) | Tokenized false positives on “twitch”; **no notice URL naming electrobrains** |
| Wayback CDX | **3 channel snapshots (2022-01-06 PST)** on one earlier pass; later retries **IA Temporarily Offline** (~17:37 PDT) |
| X search (DMCA/strike/deleted/takedown/VOD) | **Login-walled** — no search hits readable |
| X profiles `BrianReborn_alt`, `born_brian85001` | Profiles readable; **no Twitch/DMCA/VOD/takedown language** in visible recent posts |
| TwitchTracker / SullyGnome | Channel live/trackable; **no ban/suspension flag shown** |
| Full ARCHIVE VOD list (GQL) | **18 VODs**, all titled “just security”, status `RECORDED`, Sep 5–11 2026 PDT |

**No concrete public DMCA notice URL, strike count, or ToS-ban flag found for this channel.**

---

## 1. Lumen Database

Anubis PoW solved via session cookie (requests); search pages returned `Search :: Lumen`.

### Hits / nulls (each as required)

| Source URL | What was seen | Confidence | Implication |
|------------|---------------|------------|-------------|
| https://lumendatabase.org/notices/search?term=electrobrains | Page title `Search :: Lumen`; UI text **“Found 0 results”**; no `/notices/{id}` result cards | **high** | No Lumen-indexed notice matching bare login |
| https://lumendatabase.org/notices/search?term=%22electrobrains%22 | **“Found 0 results”** | **high** | Quoted exact-token search also empty |
| https://lumendatabase.org/notices/search?term=%22twitch.tv/electrobrains%22 | **“Found 0 results”** | **high** | Exact channel URL string not in Lumen index |
| https://lumendatabase.org/notices/search?term=twitch.tv%2Felectrobrains | “Found 10000 results”; listed targets include `twitch.tv/zeroabyss`, `twitch.tv/kazumiow`, `twitch.tv/NotRickles`, redacted twitch URLs — **result bodies do not contain the string electrobrains** except as the search-box value / pagination query | **high** (false-positive OR tokenization) | Do **not** treat as electrobrains notices; Lumen OR-tokenizes `twitch.tv` path |
| https://lumendatabase.org/notices/search?term=electrobrains%20twitch | “Found 10000 results”; generic Twitch notices; electrobrains only in search UI, not as targeted URL in sampled cards | **high** (false-positive) | Same — “twitch” dominates |
| https://lumendatabase.org/notices/search?term=2871190456 | **Found 0 results** | **high** | No Lumen notice citing this VOD id |
| https://lumendatabase.org/notices/search?term=2871154099 | **Found 0 results** | **high** | same |
| https://lumendatabase.org/notices/search?term=2871138129 | **Found 0 results** | **high** | same |
| https://lumendatabase.org/notices/search?term=2870695078 | **Found 0 results** | **high** | same |
| https://lumendatabase.org/notices/search?term=2870687483 | **Found 0 results** | **high** | same |

**Explicit: ZERO electrobrains-specific Lumen notice URLs to cite.**

Caveat (medium): Twitch generally does not publish channel DMCA notices into Lumen; absence in Lumen ≠ proof no private Twitch notice exists.

Disambiguation: unquoted `electrobrains.com` also returns a large result set — Swiss electronics firm / other collisions, **not** treated as Twitch-channel evidence.

---

## 2. Wayback / Internet Archive

| Source URL | What was seen | Confidence | Implication |
|------------|---------------|------------|-------------|
| https://web.archive.org/cdx/search/cdx?url=www.twitch.tv/electrobrains*&output=json&limit=100 *(earlier pass ~00:27 UTC / 17:27 PDT)* | JSON CDX rows (channel only): timestamps `20220107014758`, `20220107020608` (×2); originals `https://www.twitch.tv/electrobrains` / `http://twitch.tv/electrobrains`; status 200/301 | **high** | Channel existed in IA index as of **2022-01-06 17:47 PST** and **18:06 PST**; no `/videos/` rows in that 100-limit response |
| Same CDX URL *(retry ~17:37 PDT)* | HTML **“Internet Archive: Temporarily Offline”** | **high** | Cannot re-fetch CDX or open snapshot bodies while IA offline |
| Snapshot attempt `https://web.archive.org/web/20220107014758/https://www.twitch.tv/electrobrains` | Offline interstitial (same window) | **high** | No VOD/title content recovered from Wayback this turn |
| CDX for individual VOD ids (e.g. 2871190456) | Empty / offline depending on attempt | **medium** | No archived VOD pages confirmed |

**Wayback does not currently show deleted-VOD evidence** — only historical channel homepage captures from Jan 2022, and live IA outage blocks deeper snapshot review.

---

## 3. X / Twitter (read-only; no posts/likes/follows)

| Source URL | What was seen | Confidence | Implication |
|------------|---------------|------------|-------------|
| https://x.com/search?q=electrobrains%20(DMCA%20OR%20strike%20OR%20deleted%20OR%20takedown%20OR%20VOD)%20twitch&src=typed_query&f=live | Redirect to login/onboarding (`/i/flow/login` / jf onboarding); no tweet results | **high** (wall) | Public search unusable without login; **no hits captured** |
| from:BrianReborn_alt / from:born_brian85001 keyword searches | Same login wall | **high** | No searchable confirmation of Twitch-delete chatter |
| https://x.com/BrianReborn_alt | Profile loads: “Brian reborn's alt”, Joined March 2024, 320 posts; visible posts (e.g. Sep 8 status https://x.com/BrianReborn_alt/status/2097382981224861917) about alleged harm / freemasonry — **no Twitch, DMCA, VOD, strike, takedown, or electrobrains wording in scraped recent text** | **medium** (recent-feed only, not full history) | No public strike/delete claim on visible alt timeline |
| https://x.com/born_brian85001 | Profile loads; pinned/recent about legal threats / Isaiah quote / YouTube link — **no Twitch/DMCA/VOD/takedown/electrobrains in scraped recent text** | **medium** | Same for main handle recent feed |
| Web index search for electrobrains + Twitch DMCA / handles + twitch | No indexed third-party report tying this channel or those handles to a Twitch strike | **medium** | Silence in indexes; not proof of absence of private notices |

Screenshots saved on box (not published): `/tmp/takedown-probe/x-BrianReborn_alt.png`, `x-born_brian85001.png`, `x-search-dmca.png`.

---

## 4. TwitchTracker / SullyGnome

| Source URL | What was seen | Confidence | Implication |
|------------|---------------|------------|-------------|
| https://twitchtracker.com/electrobrains | Overview: Followers **2**; Created **2017-04-25 04:17:15**; Updated 2026-09-12 00:26:44; no “Banned” / “Suspended” label in scraped page | **high** for fields shown; **n/a** for unseen flags | Tracker treats channel as existing/trackable; **no ban flag displayed** |
| https://sullygnome.com/channel/electrobrains | Followers **2**; Created **25th Apr 2017**; Mature **No**; Affiliate eligible **No**; language English; **no ban/offline enforcement banner** in header stats | **high** | Consistent with Tracker; no ToS-ban chrome shown |
| StreamsCharts | Cloudflare challenge (403/managed) — not used | — | Skipped |

---

## 5. Full VOD list (archives)

Source: Twitch GQL public `user.videos(type:ARCHIVE)` with Client-Id `kimne78kx3ncx6brgo4mv6wki5h1ko` (read-only), plus corroborating headless scrape of videos page IDs.  
Channel offline (`stream: null`); `roles.isPartner: false`; `pageInfo.hasNextPage: false` → **complete archive list = 18**.

| VOD ID | Title | Created (America/Los_Angeles) | Length | Views | Status | URL |
|--------|-------|-------------------------------|--------|-------|--------|-----|
| 2871190456 | just security | 2026-09-11 05:36 PDT | 1:43:53 | 7 | RECORDED | https://www.twitch.tv/videos/2871190456 |
| 2871154099 | just security | 2026-09-11 04:24 PDT | 1:03:52 | 2 | RECORDED | https://www.twitch.tv/videos/2871154099 |
| 2871138129 | just security | 2026-09-11 03:46 PDT | 0:32:36 | 2 | RECORDED | https://www.twitch.tv/videos/2871138129 |
| 2870695078 | just security | 2026-09-10 14:07 PDT | 0:02:09 | 5 | RECORDED | https://www.twitch.tv/videos/2870695078 |
| 2870687483 | just security | 2026-09-10 13:57 PDT | 0:05:54 | 4 | RECORDED | https://www.twitch.tv/videos/2870687483 |
| 2870617776 | just security | 2026-09-10 12:20 PDT | 0:33:37 | 3 | RECORDED | https://www.twitch.tv/videos/2870617776 |
| 2870501048 | just security | 2026-09-10 09:58 PDT | 0:43:24 | 9 | RECORDED | https://www.twitch.tv/videos/2870501048 |
| 2869662539 | just security | 2026-09-09 10:04 PDT | 0:25:10 | 10 | RECORDED | https://www.twitch.tv/videos/2869662539 |
| 2869651031 | just security | 2026-09-09 09:51 PDT | 0:06:43 | 3 | RECORDED | https://www.twitch.tv/videos/2869651031 |
| 2869007624 | just security | 2026-09-08 14:34 PDT | 0:05:49 | 11 | RECORDED | https://www.twitch.tv/videos/2869007624 |
| 2868988256 | just security | 2026-09-08 14:06 PDT | 0:08:15 | 4 | RECORDED | https://www.twitch.tv/videos/2868988256 |
| 2868974867 | just security | 2026-09-08 13:48 PDT | 0:02:45 | 2 | RECORDED | https://www.twitch.tv/videos/2868974867 |
| 2868939423 | just security | 2026-09-08 12:56 PDT | 0:10:31 | 2 | RECORDED | https://www.twitch.tv/videos/2868939423 |
| 2868280588 | just security | 2026-09-07 17:02 PDT | 0:41:59 | 5 | RECORDED | https://www.twitch.tv/videos/2868280588 |
| 2867596264 | just security | 2026-09-06 23:12 PDT | 0:04:51 | 2 | RECORDED | https://www.twitch.tv/videos/2867596264 |
| 2866581522 | just security | 2026-09-05 20:06 PDT | 0:04:48 | 4 | RECORDED | https://www.twitch.tv/videos/2866581522 |
| 2866549765 | just security | 2026-09-05 19:21 PDT | 0:07:51 | 2 | RECORDED | https://www.twitch.tv/videos/2866549765 |
| 2866319914 | just security | 2026-09-05 14:19 PDT | 0:09:42 | 4 | RECORDED | https://www.twitch.tv/videos/2866319914 |

**Implication:** Public archives currently resolve and are `RECORDED` (not an obvious platform wipe of this window). Presence of these VODs does **not** prove absence of earlier deleted IDs outside this list. Web UI `https://www.twitch.tv/electrobrains/videos?filter=archives&sort=time` returned 409 via WebFetch earlier; GQL is the authoritative inventory used here.

---

## Gaps remaining

1. Re-open Wayback snapshots when IA recovers (compare historical channel state / any `/videos/` captures).  
2. X full-history / search requires authenticated read (still mutation-free) or another public mirror — current guest search is blocked.  
3. Private Twitch creator-dashboard notices / emails remain out of public trail (coordinate Forensic Investigator; do not invent).  
4. Lumen zero ≠ Twitch-private DMCA zero.

---

## Coordinate

- Baseline: `electrobrains-takedown-baseline.md` (unchanged rows; this file is the dated dig).  
- Partner: Twitch CDN Recoverer owns fragment survival after any future removal.

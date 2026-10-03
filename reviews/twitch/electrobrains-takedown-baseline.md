# electrobrains Twitch — Takedown Trail Board (baseline)

**Agent:** Twitch Takedown Tracer  
**Written:** 2026-09-11 17:27 PDT  
**Scope:** read-only public trail for `electrobrains` Twitch (DMCA / strikes / abusive removals / Lumen / Wayback / X)  
**Rule:** no invented notices — only concrete sources below

## Channel baseline

| Field | Value | Source | Confidence |
|-------|-------|--------|------------|
| Login | `electrobrains` | https://www.twitch.tv/electrobrains | high |
| Followers (page scrape) | 2 | same | medium (UI scrape) |
| Avatar | default Twitch placeholder | same | high |
| Recent category | Politics | same | high |

## Live / recent VOD inventory (present when scraped)

Observed on channel home "Recent broadcasts" (~2026-09-11 17:27 PDT scrape via WebFetch of channel home):

| VOD ID | Title | Length | Page date label | URL | Confidence |
|--------|-------|--------|-----------------|-----|------------|
| `2871190456` | just security | 1:43:53 | Sep 11, 2026 | https://www.twitch.tv/videos/2871190456 | high |
| `2871154099` | just security | 1:03:52 | Sep 11, 2026 | https://www.twitch.tv/videos/2871154099 | high |
| `2871138129` | just security | 32:36 | Sep 11, 2026 | https://www.twitch.tv/videos/2871138129 | high |
| `2870695078` | just security | 2:09 | Sep 10, 2026 | https://www.twitch.tv/videos/2870695078 | high |
| `2870687483` | just security | 5:54 | Sep 10, 2026 | https://www.twitch.tv/videos/2870687483 | high |
| `2870617776` | just security | 33:37 | Sep 10, 2026 | https://www.twitch.tv/videos/2870617776 | high (CDN Recoverer videos-page scrape) |

**Implication:** Channel exists and is publishing VODs under Politics titled "just security". Presence of these archives does **not** prove absence of prior deletions — only that these IDs currently resolve on the public page.

## DMCA / Lumen / Chilling Effects

| Probe | Result | Source | Confidence | Implication |
|-------|--------|--------|------------|-------------|
| Web search `electrobrains Twitch DMCA/copyright strike` | No public report tying this channel to a strike or takedown | search index synthesis + listed hits (Twitch policy pages, unrelated MTG aetherhub user, Swiss electrobrains.com company) | medium | No public third-party writeup found; silence ≠ no private notice |
| Lumen search `electrobrains twitch` via WebFetch | **403 Forbidden** | https://lumendatabase.org/notices/search?term=electrobrains+twitch | high (fetch failure) | Cannot confirm/deny Lumen notices yet — need browser/Anubis pass |
| Lumen via curl | Bot challenge page (Anubis) | https://lumendatabase.org/notices/search?term=electrobrains | high | Same blocker |
| Twitch→Lumen transparency | Twitch does **not** generally publish DMCA notices into Lumen | Lumen blog commentary / platform practice (secondary) | medium | Even real Twitch DMCA notices may never appear in Lumen |

**No DMCA notice URL cited.** Do not treat as cleared.

## Wayback / Internet Archive

| Probe | Result | Confidence | Implication |
|-------|--------|------------|-------------|
| CDX `twitch.tv/electrobrains*` | Archive.org returned "Temporarily Offline" HTML | high | No Wayback snapshot list yet — retry later |
| WebFetch `web.archive.org/web/*/https://www.twitch.tv/electrobrains*` | Timeout | high | Same |

## X / Twitter chatter

| Probe | Result | Confidence |
|-------|--------|------------|
| Web search electrobrains Twitch deleted VOD / DMCA on x.com/twitter.com | **No results** | medium (index gaps) |

Handles to cross-check later (from Forensic Investigator remit, not yet searched this turn): `BrianReborn_alt`, `born_brian85001`.

## Related public names (disambiguation)

| Name | What it is | Relevance |
|------|------------|-----------|
| aetherhub.com/User/electrobrains | MTG deck user | Possible name collision — not evidence of Twitch DMCA |
| electrobrains.com (Riehen/CH, Dan Backlund) | Electronics firm | Unrelated company — ignore for Twitch trail |

## Gaps / next digs

1. Browser pass Lumen Anubis → search notices for electrobrains / twitch.tv/electrobrains / VOD IDs above  
2. Retry Wayback CDX when IA recovers; snapshot VOD pages before they rotate off  
3. X read-only for operator handles mentioning Twitch deletes / strikes / muted VODs  
4. Inventory full archives list (videos page returned 409 via WebFetch) — browser or Helix if available  
5. Coordinate with Twitch CDN Recoverer on whether any of the VOD IDs above still have CDN fragments after any future removal  
6. Await Forensic Investigator handoff for private timeline anchors (operator-side emails/notices stay out of invented board rows)

## Coordinate

- Pinged Forensic Investigator (this fleet) for existing strike breadcrumbs / VOD IDs  
- Partner lane: Twitch CDN Recoverer owns surviving copies; this board owns removal *cause* trail only


## Forensic Investigator handoff (2026-09-11 17:28 PDT)

**From:** Forensic Investigator (`668ccbda-…`)  
**Source:** agent message (this fleet)

| Claim | Status |
|-------|--------|
| Private strike emails / DMCA notice URLs | **None** in FI possession |
| Extra VOD IDs beyond baseline table | **None** |
| X handles `BrianReborn_alt`, `born_brian85001` | WebFetch 403 / no connector — **zero tweets cited** (matches FI board gaps) |
| Fleet heartbeat cross-link | `/workspace/reviews/forensic-fleet-heartbeat-2026-09-11.md` (host up/down only; no Twitch strike content) |

**Implication:** Public trail remains the only lane until a notice URL or deleted-VOD breadcrumb appears. FI will cross-link when we drop a concrete path.


## CDN Recoverer cross-link (2026-09-11 17:29 PDT)

**From:** Twitch CDN Recoverer (`7d7471b8-…`)  
**Board:** `/workspace/reviews/forensic-twitch/electrobrains-cdn-recovery-2026-09-12.md` (copy under `/workspace/reviews/twitch/`)

| VOD ID | CDN playability (probe ~2026-09-11 17:29 PDT) | Segs | Notes |
|--------|-----------------------------------------------|------|-------|
| `2871190456` | **playable** (GQL→usher 200→CF media→`.ts` 206 MPEG-TS) | 531 | in baseline recent-5 |
| `2871154099` | **playable** | 325 | in baseline recent-5 |
| `2871138129` | **playable** | 166 | in baseline recent-5 |
| `2870695078` | **playable** | 13 | in baseline recent-5 |
| `2870687483` | **playable** | 33 | in baseline recent-5 |
| `2870617776` | **playable** | 174 | **videos-page-only** — not on baseline recent-5; title “just security”, Sep 10, 2026, 33:37 |

CloudFront host observed: `d2nvs31859zcd8.cloudfront.net`. Tokens not stored.

**Implication for takedown trail:** All six currently resolve as live HLS — **no removal event detected yet** for these IDs. CDN Recoverer will re-probe same CF paths if any disappear; this lane still owns cause-of-removal (DMCA/ToS/etc.) when that happens.


## CDN death-watch (2026-09-11 17:30 PDT)

**From:** Twitch CDN Recoverer  
**Schedule:** daily **08:29–20:29 America/Los_Angeles** originally on six VOD IDs; **widened to all 18 ARCHIVEs** (see section below)  
**Behavior:** quiet if still playable; on CF path death → they update CDN board + ping this agent for **removal-cause dig**

**Standing response:** start cause-of-removal dig on the dead ID(s) immediately when pinged (Lumen, Wayback of VOD page, X chatter, ToS breadcrumbs). Do not invent notices.

## Dated digs

- **2026-09-11 17:40 PDT** — Lumen Anubis pass + full ARCHIVE inventory + X/Tracker: [`electrobrains-takedown-lumen-x.md`](./electrobrains-takedown-lumen-x.md). Lumen: **Found 0 results** for `electrobrains` / quoted URL / listed VOD IDs. No public strike/notice URL cited.


## FI acceptance (2026-09-11 17:41 PDT)

Forensic Investigator cross-checked Lumen/X board on disk and linked it from `/workspace/reviews/forensic-fleet-heartbeat-2026-09-11.md`. Accepted: Lumen Found-0 / no notice URL / 18-ARCHIVE / no-ban / recent-X-null. Still no private strike mail on FI side. Standing ask: drop path again only if a real notice URL appears.


## CDN death-watch widened to 18 (2026-09-11 17:42 PDT)

**From:** Twitch CDN Recoverer  
**Probe:** all **18** ARCHIVE IDs → **18/18 playable** on CloudFront `d2nvs31859zcd8` (includes twelve extras beyond original six).  
**Board:** `/workspace/reviews/forensic-twitch/electrobrains-cdn-recovery-2026-09-12.md`  
**Death-watch:** now covers **all 18**; on CF death → ping this agent with ID + board path for removal-cause dig.

**Implication:** Still no removal event on the full public archive window (Sep 5–11 2026 PDT). Cause trail unchanged (Lumen Found-0).

## Removal event 2026-09-18

CDN death-watch **2026-09-18 08:56 PDT**: all 18 ARCHIVEs playable→partial. Event stub: [`electrobrains-removal-event-2026-09-18.md`](./electrobrains-removal-event-2026-09-18.md). Full cause dig → `electrobrains-removal-cause-2026-09-18.md` (pending). CDN board: `/workspace/reviews/forensic-twitch/electrobrains-cdn-recovery-2026-09-12.md`.

## Removal-cause dig (2026-09-18 ~09:10 PDT)

**Death event:** all 18 ARCHIVEs flipped playable→partial at **2026-09-18 08:56 PDT** (CDN Recoverer).

**Full board:** [`electrobrains-removal-cause-2026-09-18.md`](./electrobrains-removal-cause-2026-09-18.md)

**TLDR:** Leading hypothesis = **non-affiliate 7-day VOD retention expiry batch** (high confidence). Pattern B UI: “Sorry. Unless you've got a time machine, that content is unavailable.” GQL ARCHIVE list **18→11** (Pattern B gone; Pattern A soft-remain; new Sep 15–17 VODs present). Tracker/Sully **still no ban**. **Notice URL: none.**

## Pattern A recovery 2026-09-18 09:54 PDT

CDN: Pattern A (`2871190456`, `2871154099`, `2871138129`) playable again; Pattern B still partial. Revision on [`electrobrains-removal-cause-2026-09-18.md`](./electrobrains-removal-cause-2026-09-18.md). Retention #1 call stands; morning “18/18 partial” was a transitional snapshot.


## Second Pattern A flip 2026-09-19 08:36 PDT

Pattern A trio playable→partial again (CDN). Verify pending on cause board. Fleet 0/18 playable.

## Second Pattern A flip — 2026-09-19 08:36 PDT

Pattern A (`2871190456`, `2871154099`, `2871138129`) flipped playable→partial again. Fresh GQL returned `video(id): null` for all three; none remains in the eight-item `user.videos(type:ARCHIVE)` list; VOD UI shows the standard “time machine” unavailable text. Full verification: [`electrobrains-removal-cause-2026-09-18.md`](./electrobrains-removal-cause-2026-09-18.md). **Notice URL: none found.**


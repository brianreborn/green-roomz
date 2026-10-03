# electrobrains Twitch — salvage board (2026-10-03)

**Run:** 2026-10-03 11:29–11:38 PT (box clock PT) · read-only · no login, no account changes  
**Channel:** `electrobrains` · user id `154519424` · Partner false / Affiliate false (GQL, 11:29 PT) · live stream: none  
**Inputs:** CDN board `electrobrains-cdn-recovery-2026-09-12.md`, probe `_scratch-probe-2026-09-12-full18.json` (cf_slug per ID)  
**Artifacts:** `/workspace/salvage/electrobrains/<vod_id>/meta.json` (every probe path + HTTP code + PT time), `segments/` (empty), `salvage.py`, `salvage-run.log`, `_gql-*.json`, `_wayback-cdx.{txt,json}`  
**No tokens or signed query strings recorded.** (No playback token was issuable anyway.)

## TL;DR

- **Recovered: 0 segments, 0 bytes, across all 18 VODs.** No merged files (nothing to concatenate).
- **No newer archives exist.** GQL `user.videos(type:ARCHIVE)` = 0; all types = 0; HIGHLIGHT 0; UPLOAD 0; clips (ALL_TIME) 0.
- **All 18 IDs are gone at every public layer:** GQL `video(id)` returns `null` for all 18; every CloudFront index and segment path answers **403 S3 `AccessDenied`** (S3's answer for a deleted key when listing is denied; `x-cache: Error from cloudfront`, `server: AmazonS3`); static-cdn thumbnails now **404**.
- **The last live bytes died 2026-09-19 between 09:33 and 10:34 PT:** the 3 newest VODs' `0.ts` returned 206 at the 09:33 PT death-watch and 403 at 10:34 PT. The other 15 had already been 403 since 2026-09-18 08:56 PT. Every death-watch since then (through 2026-10-03 10:38 PT) shows 403 for all 18.
- **Wayback:** 0 captures of any `/videos/<id>` page. Only the 3 channel-homepage captures from Jan 2022 (listed below).

## Per-ID table

Expected segs is an estimate: ceil(length/10 s). The playlists were never saved while readable, and the board's `Segs` column was 0. Probes per ID: 7 index paths (`index-dvr.m3u8` in `chunked`, `audio_only`, `720p60`, `720p30`, `480p30`, `360p30`, `160p30`; for 2870501048 also `index-muted-8CYUTKOQGX.m3u8` in each, so ×14), plus segments `n.ts` / `n-muted.ts` / `n-unmuted.ts` for n = 0–9 and ¼, ½, ¾, last−1, last in `chunked`, plus 0, 1, mid, last (`n.ts`, `n-muted.ts`) in every other rendition dir. Under the stop rule, the full sweep was not run because nothing answered.

| VOD ID | Created (PT) | Len | Expected segs | Recovered segs | Bytes | Merged file | Gaps | Probe evidence (2026-10-03 11:29–11:31 PT) | Status |
|---|---|---|---|---|---|---|---|---|---|
| `2871190456` | 2026-09-11 05:36 PDT | 1:43:53 | ~624 | 0 | 0 | — | all (0–623) | index 403 ×7; seg 403 ×93; thumb 404; GQL `video` null | **gone** |
| `2871154099` | 2026-09-11 04:24 PDT | 1:03:52 | ~384 | 0 | 0 | — | all (0–383) | index 403 ×7; seg 403 ×93; thumb 404; GQL `video` null | **gone** |
| `2871138129` | 2026-09-11 03:46 PDT | 32:36 | ~196 | 0 | 0 | — | all (0–195) | index 403 ×7; seg 403 ×93; thumb 404; GQL `video` null | **gone** |
| `2870695078` | 2026-09-10 14:07 PDT | 2:09 | ~13 | 0 | 0 | — | all (0–12) | index 403 ×7; seg 403 ×84; thumb 404; GQL `video` null | **gone** |
| `2870687483` | 2026-09-10 13:57 PDT | 5:54 | ~36 | 0 | 0 | — | all (0–35) | index 403 ×7; seg 403 ×90; thumb 404; GQL `video` null | **gone** |
| `2870617776` | 2026-09-10 12:20 PDT | 33:37 | ~202 | 0 | 0 | — | all (0–201) | index 403 ×7; seg 403 ×93; thumb 404; GQL `video` null | **gone** |
| `2870501048` | 2026-09-10 09:58 PDT | 43:24 | ~261 | 0 | 0 | — | all (0–260) | index 403 ×14; seg 403 ×93; thumb 404; GQL `video` null | **gone** |
| `2869662539` | 2026-09-09 10:04 PDT | 25:10 | ~151 | 0 | 0 | — | all (0–150) | index 403 ×7; seg 403 ×93; thumb 404; GQL `video` null | **gone** |
| `2869651031` | 2026-09-09 09:51 PDT | 6:43 | ~41 | 0 | 0 | — | all (0–40) | index 403 ×7; seg 403 ×93; thumb 404; GQL `video` null | **gone** |
| `2869007624` | 2026-09-08 14:34 PDT | 5:49 | ~35 | 0 | 0 | — | all (0–34) | index 403 ×7; seg 403 ×90; thumb 404; GQL `video` null | **gone** |
| `2868988256` | 2026-09-08 14:06 PDT | 8:15 | ~50 | 0 | 0 | — | all (0–49) | index 403 ×7; seg 403 ×93; thumb 404; GQL `video` null | **gone** |
| `2868974867` | 2026-09-08 13:48 PDT | 2:45 | ~17 | 0 | 0 | — | all (0–16) | index 403 ×7; seg 403 ×87; thumb 404; GQL `video` null | **gone** |
| `2868939423` | 2026-09-08 12:56 PDT | 10:31 | ~64 | 0 | 0 | — | all (0–63) | index 403 ×7; seg 403 ×93; thumb 404; GQL `video` null | **gone** |
| `2868280588` | 2026-09-07 17:02 PDT | 41:59 | ~252 | 0 | 0 | — | all (0–251) | index 403 ×7; seg 403 ×93; thumb 404; GQL `video` null | **gone** |
| `2867596264` | 2026-09-06 23:12 PDT | 4:51 | ~30 | 0 | 0 | — | all (0–29) | index 403 ×7; seg 403 ×90; thumb 404; GQL `video` null | **gone** |
| `2866581522` | 2026-09-05 20:06 PDT | 4:48 | ~29 | 0 | 0 | — | all (0–28) | index 403 ×7; seg 403 ×90; thumb 404; GQL `video` null | **gone** |
| `2866549765` | 2026-09-05 19:21 PDT | 7:51 | ~48 | 0 | 0 | — | all (0–47) | index 403 ×7; seg 403 ×93; thumb 404; GQL `video` null | **gone** |
| `2866319914` | 2026-09-05 14:19 PDT | 9:42 | ~59 | 0 | 0 | — | all (0–58) | index 403 ×7; seg 403 ×93; thumb 404; GQL `video` null | **gone** |
A parallel sample run in `/workspace/salvage/electrobrains/_run-2026-10-03/sample-probe-2026-10-03.json` (11:30–11:36 PT, another runner) independently logged **5,409 × 403 and 90 × 404, zero 2xx**. That corroborates the result above.

## Newer-archive downloads

None. As of 2026-10-03 11:29 PT the channel lists **0 videos of any type and 0 clips** (`_gql-inventory-raw.json`, `_gql-video-byid-raw.json`). No stream is live. Nothing is inside the 7-day window. No chat replay can be fetched, because the video objects return null.

## Wayback (CDX, 2026-10-03 ~11:36 PT, `_wayback-cdx.txt`)

| Query | Rows |
|---|---|
| `twitch.tv/videos/<id>` × 18 | **0 each** |
| `twitch.tv/electrobrains*` | 3: `https://web.archive.org/web/20220107014758/https://www.twitch.tv/electrobrains` (2022-01-06 17:47 PST, 200) · `https://web.archive.org/web/20220107020608/https://www.twitch.tv/electrobrains` (2022-01-06 18:06 PST, 200) · `http://twitch.tv/electrobrains` 301 at the same time |
| `m.twitch.tv/electrobrains*` | 0 |
| `clips.twitch.tv/*electrobrains*` | 0 |

## Definitively gone (public / CDN side)

All 18 Sep 5–11 PT "just security" ARCHIVE VODs: video bytes, playlists, thumbnails, metadata objects, and chat replay. That fits the Takedown Tracer cause (7-day non-affiliate retention, not DMCA). Anything streamed before 2026-09-05 was outside this inventory and is also not on Twitch.

## Remaining places a copy might still exist (not probed; need the operator's OK or action)

1. **Local recordings on the streaming machine.** OBS "Record" or replay-buffer output, normally `Videos/` or the OBS output path, on whichever host streamed: qodesh (Windows, `C:\Users\brian\Videos`?) or shalom. This run did not touch any user machine.
2. **Twitch account data request** (Settings → Security & Privacy → "Download your data" / GDPR request) from the owner account. It may include metadata or chat, but VOD media is unlikely. Only the owner can do this.
3. **Any viewer or tool that downloaded them** (7 views on 2871190456; single digits on the rest).
4. **Going forward:** turn on "Store past broadcasts" plus auto-download via OBS local recording, or export highlights (highlights do not expire on the 7-day timer).

## Timeline (PT)

| When (PT) | Event | Source |
|---|---|---|
| 2026-09-11 ~17:29 | 18/18 playable on CloudFront | CDN board |
| 2026-09-18 08:56 | 15 older → CF 403; 3 newest still tokened, bytes alive | CDN board |
| 2026-09-18 09:54 | 3 newest briefly playable again | CDN board |
| 2026-09-19 08:36 | 3 newest lose token; index 403; `0.ts` still 206 | CDN board |
| 2026-09-19 09:33 | last probe with live bytes (`0.ts` 206 ×3) | `_scratch-probe-deathwatch-2026-09-19-0932.json` |
| 2026-09-19 10:34 | `0.ts` 403 ×3 — all 18 dead at CDN | `_scratch-probe-deathwatch-2026-09-19-1034.json` |
| 2026-10-03 11:29–11:38 | salvage: 0 archives listed, 0/18 GQL objects, 0 segments, 0 Wayback VOD captures | this board |

**Board path:** `/workspace/reviews/forensic-twitch/electrobrains-salvage-2026-10-03.md`

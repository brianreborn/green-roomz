# electrobrains salvage — addendum (second sweep, 2026-10-03)

**Run:** 2026-10-03 11:29–11:55 PT · read-only · no login, no account changes · no tokens or signed query strings stored  
**Companion to:** `electrobrains-salvage-2026-10-03.md` (first runner's board, left untouched)  
**Artifacts:** `/workspace/salvage/electrobrains/_run-2026-10-03/` (`archive-list-2026-10-03.json`, `video-meta-2026-10-03.json`, `sample-probe-2026-10-03.json`, `alt-cdn-hosts-probe-2026-10-03.json`, `wayback-cdx-2026-10-03.json`, `clips-2026-10-03.json`, `ytdlp-check-2026-10-03.txt`, `later8-created-estimate.json`, `twitchtracker-electrobrains-2026-10-03.html`); per-ID `meta-sweep2-2026-10-03.json` in each of the 18 dirs; new dirs + `meta.json` for the 8 later IDs.

## Result

This sweep confirms the first board: **0 segments and 0 bytes recovered for all 26 IDs.** Nothing could be merged. Status for all 26: **gone**.

| Check (2026-10-03 PT) | Result |
|---|---|
| GQL `user(154519424).videos` ARCHIVE / all types | 0 / 0 (`hasNextPage:false`) |
| GQL clips (ALL_TIME) | 0 |
| GQL `video(id)` for 18 originals and 8 later IDs | `null` ×26; no playback token ×26 |
| yt-dlp (2871190456, 2876220917, 2866319914, channel /videos) | "Video … does not exist" ×3; playlist 0 items |
| d2nvs31859zcd8 CF sweep for 18 (7 dirs: chunked, 720p60, 720p30, 480p30, 360p30, 160p30, audio_only; `index-dvr`/`index-muted`; `n`, `n-muted`, `n-unmuted` for n = 0–9, ¼, ½, ¾, last; storyboards) | 5,409 × 403, 0 × 2xx |
| static-cdn thumbnails (4 variants ×18) | 90 × 404 |
| Same slugs on 18 other Twitch VOD CloudFront hosts (index + `0.ts`) | 468 × 403; 5 hosts no DNS/connect; 0 × 2xx |
| Wayback CDX: `/videos/<id>` ×26, `/electrobrains/videos`, m.twitch, TwitchTracker, SullyGnome, static-cdn & CF paths | 0 rows each. Only the 3 Jan 2022 channel-homepage captures, already on the first board |
| TwitchTracker / SullyGnome stream pages | 403 (bot wall). Overview page has no stream rows |

## New: second-precision stream start for the 18 (from the epoch in each cf_slug)

Each slug ends in a Unix epoch, and it matches the board's created minute exactly for all 18:

| VOD ID | Stream start (PT) |
|---|---|
| 2866319914 | 2026-09-05 14:19:27 PDT |
| 2866549765 | 2026-09-05 19:21:23 PDT |
| 2866581522 | 2026-09-05 20:06:45 PDT |
| 2867596264 | 2026-09-06 23:12:22 PDT |
| 2868280588 | 2026-09-07 17:02:14 PDT |
| 2868939423 | 2026-09-08 12:56:24 PDT |
| 2868974867 | 2026-09-08 13:48:08 PDT |
| 2868988256 | 2026-09-08 14:06:21 PDT |
| 2869007624 | 2026-09-08 14:34:07 PDT |
| 2869651031 | 2026-09-09 09:51:23 PDT |
| 2869662539 | 2026-09-09 10:04:11 PDT |
| 2870501048 | 2026-09-10 09:58:42 PDT |
| 2870617776 | 2026-09-10 12:20:23 PDT |
| 2870687483 | 2026-09-10 13:57:35 PDT |
| 2870695078 | 2026-09-10 14:07:18 PDT |
| 2871138129 | 2026-09-11 03:46:40 PDT |
| 2871154099 | 2026-09-11 04:24:08 PDT |
| 2871190456 | 2026-09-11 05:36:21 PDT |

## Later 8 IDs: created times

No observed created time could be recovered. GQL returns null, no cf_slug or thumbnail was ever saved on disk, Wayback has 0 captures, and TwitchTracker/SullyGnome are bot-walled. Their CloudFront residuals **cannot be probed**: the slug includes a 20-hex hash, and guessing it would mean inventing URLs.

**Estimate only (not observed):** linear fit of VOD ID against the 18 known start times (~35,760 IDs/hour; in-sample max error 2.1 h; this is extrapolated, so allow roughly ±4 h):

| VOD ID | Estimated created (PT) |
|---|---|
| 2874677451 | ~2026-09-15 06:00 |
| 2874917632 | ~2026-09-15 12:45 |
| 2875284614 | ~2026-09-15 23:00 |
| 2875289627 | ~2026-09-15 23:10 |
| 2875298153 | ~2026-09-15 23:25 |
| 2875900029 | ~2026-09-16 16:15 |
| 2875903541 | ~2026-09-16 16:20 |
| 2876220917 | ~2026-09-17 01:10 |

This fits the "Sep 15–17 PDT" note in the removal-cause board. They were last seen as RECORDED on 2026-09-19 and would have hit the 7-day expiry around Sep 22–24.

## Definitively gone

All 26 IDs (18 Sep 5–11 + 8 Sep ~15–17), at every public layer probed. The last live bytes anywhere were `0.ts` 206 on 2871190456 / 2871154099 / 2871138129 at the 2026-09-19 09:33 PT death-watch; they returned 403 at 10:34 PT. No media file for any of these VODs exists anywhere on the box (filesystem search). The only visual remnants are prior screenshots in `/workspace/reviews/twitch/_scratch/` (e.g. `vod-A-2871190456.png`).

## Remaining non-public avenues (need the operator)

Local OBS recordings on the streaming host (qodesh `C:\Users\brian\Videos` or the OBS output path; shalom; note9 if it streamed); a Twitch "Download your data" request from the owner account; any viewer copies. None of these were touched.

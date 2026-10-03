# electrobrains Twitch — CDN / surviving-copy board

**Agent:** Twitch CDN Recoverer  
**Updated:** 2026-09-19 08:36 PDT  
**Scope:** read-only surviving copies (Twitch CDN / usher / CloudFront). No account mutation.  
**Rule:** no invented VOD IDs or CDN URLs — only what resolved this probe.  
**Inventory source:** Takedown Tracer GQL full ARCHIVE list (18) in `/workspace/reviews/twitch/electrobrains-takedown-lumen-x.md`  
**Channel Twitch user id:** `154519424` (per Takedown Tracer)

## Playability summary

- **0/18 playable** this probe; **18/18 partial**; **0/18 dead**.
- Dropped **playable → partial**: `2871190456`, `2871154099`, `2871138129` (no playback token; usher skipped; documented CF index now `403`; sample `.ts` still `206`).
- Other 15 unchanged **partial**: GQL no playback token; documented CF index and sample `.ts` still `403` (not 404/gone).
- CDN host: `d2nvs31859zcd8.cloudfront.net`.
- Death-watch remains all **18** IDs.

## Candidate copies

| VOD ID | Created (LA) | Len | Views | Bucket | Thumb | Token | Usher | Segs | `.ts` | Playability | CloudFront chunked index |
|--------|--------------|-----|-------|--------|-------|-------|-------|------|-------|-------------|--------------------------|
| `2871190456` | 2026-09-11 05:36 PDT | 1:43:53 | 7 | prior-watch | 200 | False | — | 0 | 206 | **partial** | `d2nvs31859zcd8.cloudfront.net/a31012fb936e6b949ef0_electrobrains_317428985463_1789130181/chunked/index-dvr.m3u8` |
| `2871154099` | 2026-09-11 04:24 PDT | 1:03:52 | 2 | prior-watch | 200 | False | — | 0 | 206 | **partial** | `d2nvs31859zcd8.cloudfront.net/9a50eb96cfac9b1ea161_electrobrains_318100799320_1789125848/chunked/index-dvr.m3u8` |
| `2871138129` | 2026-09-11 03:46 PDT | 32:36 | 2 | prior-watch | 200 | False | — | 0 | 206 | **partial** | `d2nvs31859zcd8.cloudfront.net/0e2168e977518911376d_electrobrains_319188304727_1789123600/chunked/index-dvr.m3u8` |
| `2870695078` | 2026-09-10 14:07 PDT | 2:09 | 5 | prior-watch | 200 | False | — | 0 | 403 | **partial** | `d2nvs31859zcd8.cloudfront.net/4cc1a5eaae99a62558e9_electrobrains_319180356439_1789074438/chunked/index-dvr.m3u8` |
| `2870687483` | 2026-09-10 13:57 PDT | 5:54 | 4 | prior-watch | 200 | False | — | 0 | 403 | **partial** | `d2nvs31859zcd8.cloudfront.net/13129dae587f24b594e7_electrobrains_318095241816_1789073855/chunked/index-dvr.m3u8` |
| `2870617776` | 2026-09-10 12:20 PDT | 33:37 | 3 | prior-watch | 200 | False | — | 0 | 403 | **partial** | `d2nvs31859zcd8.cloudfront.net/88cfbb2e89bbdbf396d1_electrobrains_318094804440_1789068023/chunked/index-dvr.m3u8` |
| `2870501048` | 2026-09-10 09:58 PDT | 43:24 | 9 | archive-expand | 200 | False | — | 0 | 403 | **partial** | `d2nvs31859zcd8.cloudfront.net/6e5e8f4afdb4c72e2930_electrobrains_317423134839_1789059522/chunked/index-muted-8CYUTKOQGX.m3u8` |
| `2869662539` | 2026-09-09 10:04 PDT | 25:10 | 10 | archive-expand | 200 | False | — | 0 | 403 | **partial** | `d2nvs31859zcd8.cloudfront.net/89991b3232c1b771c7fa_electrobrains_319167491927_1788973451/chunked/index-dvr.m3u8` |
| `2869651031` | 2026-09-09 09:51 PDT | 6:43 | 3 | archive-expand | 200 | False | — | 0 | 403 | **partial** | `d2nvs31859zcd8.cloudfront.net/6e4660f11e3e4b40777b_electrobrains_319167407575_1788972683/chunked/index-dvr.m3u8` |
| `2869007624` | 2026-09-08 14:34 PDT | 5:49 | 11 | archive-expand | 200 | False | — | 0 | 403 | **partial** | `d2nvs31859zcd8.cloudfront.net/6daa672567fa787f2ca4_electrobrains_317411760247_1788903247/chunked/index-dvr.m3u8` |
| `2868988256` | 2026-09-08 14:06 PDT | 8:15 | 4 | archive-expand | 200 | False | — | 0 | 403 | **partial** | `d2nvs31859zcd8.cloudfront.net/3f51160aad689aaa8ba2_electrobrains_319158486359_1788901581/chunked/index-dvr.m3u8` |
| `2868974867` | 2026-09-08 13:48 PDT | 2:45 | 2 | archive-expand | 200 | False | — | 0 | 403 | **partial** | `d2nvs31859zcd8.cloudfront.net/d6abe251013824095de7_electrobrains_319158344791_1788900488/chunked/index-dvr.m3u8` |
| `2868939423` | 2026-09-08 12:56 PDT | 10:31 | 2 | archive-expand | 200 | False | — | 0 | 403 | **partial** | `d2nvs31859zcd8.cloudfront.net/e058aae632d363b00862_electrobrains_319157973591_1788897384/chunked/index-dvr.m3u8` |
| `2868280588` | 2026-09-07 17:02 PDT | 41:59 | 5 | archive-expand | 200 | False | — | 0 | 403 | **partial** | `d2nvs31859zcd8.cloudfront.net/f5704248a33418af7621_electrobrains_318073743704_1788825734/chunked/index-dvr.m3u8` |
| `2867596264` | 2026-09-06 23:12 PDT | 4:51 | 2 | archive-expand | 200 | False | — | 0 | 403 | **partial** | `d2nvs31859zcd8.cloudfront.net/28f4d47fbd11254d6af4_electrobrains_319140371799_1788761542/chunked/index-dvr.m3u8` |
| `2866581522` | 2026-09-05 20:06 PDT | 4:48 | 4 | archive-expand | 200 | False | — | 0 | 403 | **partial** | `d2nvs31859zcd8.cloudfront.net/ec87704ae66a4df6e973_electrobrains_318059767896_1788664005/chunked/index-dvr.m3u8` |
| `2866549765` | 2026-09-05 19:21 PDT | 7:51 | 2 | archive-expand | 200 | False | — | 0 | 403 | **partial** | `d2nvs31859zcd8.cloudfront.net/7be4f7d301ba366af5df_electrobrains_319125125591_1788661283/chunked/index-dvr.m3u8` |
| `2866319914` | 2026-09-05 14:19 PDT | 9:42 | 4 | archive-expand | 200 | False | — | 0 | 403 | **partial** | `d2nvs31859zcd8.cloudfront.net/99005e0d1fff91b3e313_electrobrains_319121628503_1788643167/chunked/index-dvr.m3u8` |

## Change log

- **2026-09-19 08:36 PDT:** `2871190456`, `2871154099`, and `2871138129` dropped **playable → partial** (token `False`; usher skipped; documented CF index `403`; sample `.ts` still `206`). Other 15 remain **partial** (no token; CF index/sample still `403`). No CF `404` observed. Now **0/18 playable**, **18/18 partial**, **0/18 dead**.
- **2026-09-18 09:54 PDT:** `2871190456`, `2871154099`, and `2871138129` recovered **partial → playable** (token `True`, usher `200` `#EXTM3U`, CF index/sample still `200/206`). Other 15 remain **partial** (no token; CF index/sample still `403`). No CF `404` observed.
- **2026-09-18 08:56 PDT:** all 18 IDs changed from `playable` to `partial`. `2871190456`, `2871154099`, and `2871138129` had token `True` but usher `404`; their documented CF index/sample remained `200/206`. The remaining 15 (`2870695078`, `2870687483`, `2870617776`, `2870501048`, `2869662539`, `2869651031`, `2869007624`, `2868988256`, `2868974867`, `2868939423`, `2868280588`, `2867596264`, `2866581522`, `2866549765`, `2866319914`) had no playback token and documented CF index/sample `403`. No documented CF `404` was observed.

## Page URLs

- https://www.twitch.tv/videos/2871190456
- https://www.twitch.tv/videos/2871154099
- https://www.twitch.tv/videos/2871138129
- https://www.twitch.tv/videos/2870695078
- https://www.twitch.tv/videos/2870687483
- https://www.twitch.tv/videos/2870617776
- https://www.twitch.tv/videos/2870501048
- https://www.twitch.tv/videos/2869662539
- https://www.twitch.tv/videos/2869651031
- https://www.twitch.tv/videos/2869007624
- https://www.twitch.tv/videos/2868988256
- https://www.twitch.tv/videos/2868974867
- https://www.twitch.tv/videos/2868939423
- https://www.twitch.tv/videos/2868280588
- https://www.twitch.tv/videos/2867596264
- https://www.twitch.tv/videos/2866581522
- https://www.twitch.tv/videos/2866549765
- https://www.twitch.tv/videos/2866319914

## Notes

- Tokens / signed usher query strings **not** stored (expire quickly).
- Presence of RECORDED archives ≠ absence of older deleted IDs outside this 18.
- Coordinate: ping Twitch Takedown Tracer with ID + this board path if any CF path dies.

**Board path:** `/workspace/reviews/forensic-twitch/electrobrains-cdn-recovery-2026-09-12.md`  
**Raw probe:** `/workspace/reviews/forensic-twitch/_scratch-probe-deathwatch-2026-09-19-0833.json`

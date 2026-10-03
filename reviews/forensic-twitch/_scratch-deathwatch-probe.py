#!/usr/bin/env python3
"""Read-only electrobrains CDN death-watch probe. Does not store playback tokens."""
import json
import re
import urllib.error
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

PT = ZoneInfo("America/Los_Angeles")
CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko"
GQL = "https://gql.twitch.tv/gql"
USHER = "https://usher.ttvnw.net/vod/{vod_id}.m3u8"

# Documented CF indexes from board (no invented paths)
CF_INDEX = {
    "2871190456": "https://d2nvs31859zcd8.cloudfront.net/a31012fb936e6b949ef0_electrobrains_317428985463_1789130181/chunked/index-dvr.m3u8",
    "2871154099": "https://d2nvs31859zcd8.cloudfront.net/9a50eb96cfac9b1ea161_electrobrains_318100799320_1789125848/chunked/index-dvr.m3u8",
    "2871138129": "https://d2nvs31859zcd8.cloudfront.net/0e2168e977518911376d_electrobrains_319188304727_1789123600/chunked/index-dvr.m3u8",
    "2870695078": "https://d2nvs31859zcd8.cloudfront.net/4cc1a5eaae99a62558e9_electrobrains_319180356439_1789074438/chunked/index-dvr.m3u8",
    "2870687483": "https://d2nvs31859zcd8.cloudfront.net/13129dae587f24b594e7_electrobrains_318095241816_1789073855/chunked/index-dvr.m3u8",
    "2870617776": "https://d2nvs31859zcd8.cloudfront.net/88cfbb2e89bbdbf396d1_electrobrains_318094804440_1789068023/chunked/index-dvr.m3u8",
    "2870501048": "https://d2nvs31859zcd8.cloudfront.net/6e5e8f4afdb4c72e2930_electrobrains_317423134839_1789059522/chunked/index-muted-8CYUTKOQGX.m3u8",
    "2869662539": "https://d2nvs31859zcd8.cloudfront.net/89991b3232c1b771c7fa_electrobrains_319167491927_1788973451/chunked/index-dvr.m3u8",
    "2869651031": "https://d2nvs31859zcd8.cloudfront.net/6e4660f11e3e4b40777b_electrobrains_319167407575_1788972683/chunked/index-dvr.m3u8",
    "2869007624": "https://d2nvs31859zcd8.cloudfront.net/6daa672567fa787f2ca4_electrobrains_317411760247_1788903247/chunked/index-dvr.m3u8",
    "2868988256": "https://d2nvs31859zcd8.cloudfront.net/3f51160aad689aaa8ba2_electrobrains_319158486359_1788901581/chunked/index-dvr.m3u8",
    "2868974867": "https://d2nvs31859zcd8.cloudfront.net/d6abe251013824095de7_electrobrains_319158344791_1788900488/chunked/index-dvr.m3u8",
    "2868939423": "https://d2nvs31859zcd8.cloudfront.net/e058aae632d363b00862_electrobrains_319157973591_1788897384/chunked/index-dvr.m3u8",
    "2868280588": "https://d2nvs31859zcd8.cloudfront.net/f5704248a33418af7621_electrobrains_318073743704_1788825734/chunked/index-dvr.m3u8",
    "2867596264": "https://d2nvs31859zcd8.cloudfront.net/28f4d47fbd11254d6af4_electrobrains_319140371799_1788761542/chunked/index-dvr.m3u8",
    "2866581522": "https://d2nvs31859zcd8.cloudfront.net/ec87704ae66a4df6e973_electrobrains_318059767896_1788664005/chunked/index-dvr.m3u8",
    "2866549765": "https://d2nvs31859zcd8.cloudfront.net/7be4f7d301ba366af5df_electrobrains_319125125591_1788661283/chunked/index-dvr.m3u8",
    "2866319914": "https://d2nvs31859zcd8.cloudfront.net/99005e0d1fff91b3e313_electrobrains_319121628503_1788643167/chunked/index-dvr.m3u8",
}

PRIOR = {
    "as_of_pt": "2026-09-19 08:36 PDT",
    "playable": [],
    "partial": list(CF_INDEX.keys()),
    "dead": [],
}
PRIOR_BY_ID = {vid: "partial" for vid in CF_INDEX}

GQL_QUERY = {
    "operationName": "PlaybackAccessToken",
    "variables": {"isLive": False, "login": "", "isVod": True, "vodID": "", "playerType": "site"},
    "extensions": {
        "persistedQuery": {
            "version": 1,
            "sha256Hash": "0828119ded1c13477966434e15800ff57ddacf13ba1911c129dc220659d13171",
        }
    },
}


def http_get(url, headers=None, timeout=25, method="GET", range_bytes=None):
    h = {"User-Agent": "Mozilla/5.0 (compatible; electrobrains-cdn-deathwatch/1.0)"}
    if headers:
        h.update(headers)
    if range_bytes:
        h["Range"] = range_bytes
    req = urllib.request.Request(url, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            return resp.status, dict(resp.headers), body, None
    except urllib.error.HTTPError as e:
        body = e.read() if e.fp else b""
        return e.code, dict(e.headers) if e.headers else {}, body, None
    except Exception as e:
        return None, {}, b"", f"{type(e).__name__}: {e}"


def sample_ts_url(index_url: str) -> str:
    # Prefer 0.ts beside the index basename
    base = index_url.rsplit("/", 1)[0]
    return f"{base}/0.ts"


def classify(token_ok, usher_extm3u, cf_index_status, cf_seg_status):
    if token_ok and usher_extm3u:
        return "playable"
    # CF path gone
    if cf_index_status == 404 and (cf_seg_status in (None, 404)):
        return "dead"
    if cf_index_status == 404 and cf_seg_status == 404:
        return "dead"
    return "partial"


def probe_one(vod_id: str):
    out = {
        "vod_id": vod_id,
        "gql_status": None,
        "token_ok": False,
        "usher_status": None,
        "usher_extm3u": False,
        "documented_cf_index_status": None,
        "documented_cf_extm3u": False,
        "segment_line_count": 0,
        "documented_cf_seg_status": None,
        "sample_seg_url": sample_ts_url(CF_INDEX[vod_id]),
        "playability": None,
        "status_changes_vs_prior": None,
    }
    transport_err = None

    q = json.loads(json.dumps(GQL_QUERY))
    q["variables"]["vodID"] = vod_id
    payload = json.dumps(q).encode()
    req = urllib.request.Request(
        GQL,
        data=payload,
        headers={
            "Client-ID": CLIENT_ID,
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; electrobrains-cdn-deathwatch/1.0)",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            raw = resp.read()
            out["gql_status"] = resp.status
            data = json.loads(raw.decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as e:
        out["gql_status"] = e.code
        transport_err = f"gql HTTPError {e.code}"
        data = None
    except Exception as e:
        transport_err = f"gql {type(e).__name__}: {e}"
        data = None

    token = None
    sig = None
    if data:
        try:
            pat = data["data"]["videoPlaybackAccessToken"]
            if pat and pat.get("value") and pat.get("signature"):
                token = pat["value"]
                sig = pat["signature"]
                out["token_ok"] = True
        except (TypeError, KeyError, AttributeError):
            pass

    if out["token_ok"] and token and sig:
        # Build usher URL; do not persist token/sig
        from urllib.parse import urlencode

        usher_url = USHER.format(vod_id=vod_id) + "?" + urlencode(
            {
                "allow_source": "true",
                "allow_audio_only": "true",
                "player": "twitchweb",
                "playlist_include_framerate": "true",
                "sig": sig,
                "token": token,
            }
        )
        st, _, body, err = http_get(usher_url)
        out["usher_status"] = st
        if err:
            transport_err = (transport_err + "; " if transport_err else "") + f"usher {err}"
        elif body:
            text = body.decode("utf-8", errors="replace")
            out["usher_extm3u"] = text.lstrip().startswith("#EXTM3U")
        # drop token/sig from locals ASAP
        del token, sig, usher_url

    # Documented CF index
    idx_url = CF_INDEX[vod_id]
    st, _, body, err = http_get(idx_url)
    out["documented_cf_index_status"] = st
    if err:
        transport_err = (transport_err + "; " if transport_err else "") + f"cf_index {err}"
    elif body is not None:
        text = body.decode("utf-8", errors="replace")
        out["documented_cf_extm3u"] = text.lstrip().startswith("#EXTM3U")
        # count non-empty non-comment lines roughly as prior probes did
        lines = [ln for ln in text.splitlines() if ln.strip()]
        out["segment_line_count"] = len(lines)

    # Sample .ts with Range (prior probes saw 206 when partial bytes available)
    seg_url = out["sample_seg_url"]
    st, _, body, err = http_get(seg_url, range_bytes="bytes=0-1")
    out["documented_cf_seg_status"] = st
    if err:
        transport_err = (transport_err + "; " if transport_err else "") + f"cf_seg {err}"

    play = classify(
        out["token_ok"],
        out["usher_extm3u"],
        out["documented_cf_index_status"],
        out["documented_cf_seg_status"],
    )
    # Refine dead: both index and seg 404, or index 404 with no residual
    if (
        out["documented_cf_index_status"] == 404
        and out["documented_cf_seg_status"] in (404, None)
        and not out["token_ok"]
        and not out["usher_extm3u"]
    ):
        play = "dead"
    out["playability"] = play

    prior = PRIOR_BY_ID.get(vod_id)
    if prior and prior != play:
        out["status_changes_vs_prior"] = f"{prior} -> {play}"

    return out, transport_err


def main():
    now = datetime.now(PT)
    stamp = now.strftime("%Y-%m-%d-%H%M")
    results = []
    transport_failures = []
    changed = []
    cf_404_while_previously_playable = []

    for vod_id in CF_INDEX:
        row, terr = probe_one(vod_id)
        results.append(row)
        if terr:
            transport_failures.append({"vod_id": vod_id, "error": terr})
        if row["status_changes_vs_prior"]:
            changed.append({"vod_id": vod_id, "change": row["status_changes_vs_prior"]})
        if (
            row["documented_cf_index_status"] == 404
            and vod_id in PRIOR["playable"]
        ):
            cf_404_while_previously_playable.append(vod_id)

    counts = {"playable": 0, "partial": 0, "dead": 0}
    for r in results:
        counts[r["playability"]] = counts.get(r["playability"], 0) + 1

    out = {
        "probe_timestamp_pt": now.isoformat(),
        "client_id_used": CLIENT_ID,
        "prior_board_status": PRIOR,
        "summary_counts": counts,
        "changed": changed,
        "cf_404_while_previously_playable": cf_404_while_previously_playable,
        "transport_failures": transport_failures,
        "results": results,
    }
    path = f"/workspace/reviews/forensic-twitch/_scratch-probe-deathwatch-{stamp}.json"
    with open(path, "w") as f:
        json.dump(out, f, indent=2)
        f.write("\n")
    # Print summary only (no tokens)
    print(json.dumps({
        "scratch": path,
        "probe_timestamp_pt": out["probe_timestamp_pt"],
        "summary_counts": counts,
        "changed": changed,
        "cf_404_while_previously_playable": cf_404_while_previously_playable,
        "transport_failures": transport_failures,
        "per_id": [
            {
                "vod_id": r["vod_id"],
                "playability": r["playability"],
                "token_ok": r["token_ok"],
                "usher_status": r["usher_status"],
                "cf_index": r["documented_cf_index_status"],
                "cf_seg": r["documented_cf_seg_status"],
                "change": r["status_changes_vs_prior"],
            }
            for r in results
        ],
    }, indent=2))


if __name__ == "__main__":
    main()

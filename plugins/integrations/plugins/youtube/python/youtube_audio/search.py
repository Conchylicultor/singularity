"""Search YouTube for videos, as the results page lists them.

The runPython contract: ONE JSON document on stdin, ONE on stdout, anything
else (progress, warnings) on stderr.

    stdin   {"query": "…", "limit": 10, "bunPath": "…"}
    stdout  {"results": [{"videoId", "title", "channel", "durationSec",
                          "viewCount", "channelVerified", "artTrack"}…],
             "ytDlpVersion"}

- `ytsearchN:<query>` with `extract_flat`: one request for the results page,
  no video page is opened, nothing is downloaded. So it is cheap (~1–2 s), and
  each result carries only what the results page shows: id, title, channel,
  duration, view count, the channel's verified badge (null when absent from
  the page) and whether the video is an auto-generated art track (its snippet
  starts "Provided to YouTube by", the label-delivered studio audio a
  "<Artist> - Topic" channel holds — the results page names that channel by
  the artist alone).
- Results come back in YouTube's own order: the caller ranks them.
- Entries that are not videos (a channel, a playlist) are dropped.
- Anything that fails is a crash (exit 1): a search has no "unavailable" answer.
"""

import contextlib
import json
import re
import sys

import yt_dlp

from youtube_audio._common import StderrLogger

VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{11}")
MAX_LIMIT = 50
# The first words of an auto-generated art track's description.
ART_TRACK_PREFIX = "Provided to YouTube by"


def main() -> None:
    request = json.load(sys.stdin)
    query: str = request["query"].strip()
    limit: int = int(request["limit"])
    bun_path: str = request["bunPath"]
    if query == "":
        raise ValueError("empty search query")
    if not 1 <= limit <= MAX_LIMIT:
        raise ValueError(f"limit must be within 1–{MAX_LIMIT}, got {limit}")

    options = {
        "extract_flat": "in_playlist",
        "skip_download": True,
        "js_runtimes": {"bun": {"path": bun_path}},
        # No ~/.cache/yt-dlp: the machine's data dirs are declared, and this is not one.
        "cachedir": False,
        "logger": StderrLogger(),
        "noprogress": True,
    }
    # Belt and braces: whatever yt-dlp prints must not reach our stdout.
    with contextlib.redirect_stdout(sys.stderr), yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)

    results = []
    for entry in info.get("entries") or []:
        video_id = entry.get("id") or ""
        if not VIDEO_ID.fullmatch(video_id):
            continue
        if entry.get("ie_key") not in (None, "Youtube"):
            continue
        duration = entry.get("duration")
        views = entry.get("view_count")
        description = entry.get("description") or ""
        results.append(
            {
                "videoId": video_id,
                "title": entry.get("title") or "",
                "channel": entry.get("channel") or entry.get("uploader") or "",
                "durationSec": float(duration) if duration is not None else None,
                "viewCount": int(views) if views is not None else None,
                "channelVerified": entry.get("channel_is_verified"),
                "artTrack": description.startswith(ART_TRACK_PREFIX),
            }
        )

    json.dump(
        {"results": results, "ytDlpVersion": yt_dlp.version.__version__},
        sys.stdout,
    )


if __name__ == "__main__":
    main()

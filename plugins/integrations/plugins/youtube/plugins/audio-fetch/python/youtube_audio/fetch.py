"""Download one YouTube video's best audio stream, as it is served.

The runPython contract: ONE JSON document on stdin, ONE on stdout, anything
else (progress, warnings) on stderr.

    stdin   {"videoId": "…", "outDir": "…", "bunPath": "…"}
    stdout  {"file", "format", "durationSec", "title", "channel", "ytDlpVersion"}

- `-f bestaudio` in its native container (webm/opus or m4a/aac): no ffmpeg,
  no post-processing, no fixup.
- YouTube's JavaScript challenges are solved by yt-dlp-ejs on bun, the
  runtime that is already on the machine (`js_runtimes`, passed as a path).
- Downloaded under a temp name in `outDir`, then renamed to `<videoId>.<ext>`,
  so a reader never sees a partial file under the final name.
- A video that cannot be had at all (unavailable, private, removed,
  age-gated) exits 3 with `UNAVAILABLE: <yt-dlp's message>` as the last
  stderr line. Anything else is a crash (exit 1): it may work next time.
"""

import contextlib
import json
import os
import re
import sys

import yt_dlp
from yt_dlp.utils import DownloadError

EXIT_UNAVAILABLE = 3

# yt-dlp's messages for a video no retry will bring back. A bot check
# ("Sign in to confirm you're not a bot") is deliberately NOT here: it clears.
PERMANENT = re.compile(
    r"video (is )?unavailable"
    r"|Private video|This video is private"
    r"|confirm your age|age-restricted|inappropriate for some users"
    r"|has been removed|no longer available"
    r"|This video is not available"
    r"|account associated with this video has been terminated"
    r"|members-only|Join this channel",
    re.IGNORECASE,
)


def log(line: str) -> None:
    print(line, file=sys.stderr, flush=True)


class StderrLogger:
    """yt-dlp's logger, routed to stderr: stdout carries only the result."""

    def debug(self, msg: str) -> None:
        # yt-dlp sends info lines through debug, prefixed "[debug] " for real debug.
        if not msg.startswith("[debug] "):
            log(msg)

    def info(self, msg: str) -> None:
        log(msg)

    def warning(self, msg: str) -> None:
        log(f"WARNING: {msg}")

    def error(self, msg: str) -> None:
        log(msg)


def progress_hook():
    last = {"decile": -1}

    def hook(d: dict) -> None:
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            if total:
                decile = int(d.get("downloaded_bytes", 0) * 10 / total)
                if decile > last["decile"]:
                    last["decile"] = decile
                    log(f"downloading {decile * 10}% of {total / 1e6:.1f} MB")
        elif d.get("status") == "finished":
            log(f"downloaded {d.get('total_bytes', 0) / 1e6:.1f} MB")

    return hook


def main() -> None:
    request = json.load(sys.stdin)
    video_id: str = request["videoId"]
    out_dir: str = request["outDir"]
    bun_path: str = request["bunPath"]
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise ValueError(f"not a YouTube video id: {video_id!r}")

    temp_stem = os.path.join(out_dir, f".tmp-{video_id}-{os.getpid()}")
    options = {
        "format": "bestaudio",
        "outtmpl": f"{temp_stem}.%(ext)s",
        "noplaylist": True,
        "postprocessors": [],
        "fixup": "never",
        "js_runtimes": {"bun": {"path": bun_path}},
        # No ~/.cache/yt-dlp: the machine's data dirs are declared, and this is not one.
        "cachedir": False,
        "logger": StderrLogger(),
        "noprogress": True,
        "progress_hooks": [progress_hook()],
    }
    url = f"https://www.youtube.com/watch?v={video_id}"
    try:
        # Belt and braces: whatever yt-dlp prints must not reach our stdout.
        with contextlib.redirect_stdout(sys.stderr), yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=True)
    except DownloadError as err:
        message = str(err.msg)
        if PERMANENT.search(message):
            log(f"UNAVAILABLE: {message.removeprefix('ERROR: ')}")
            sys.exit(EXIT_UNAVAILABLE)
        raise
    finally:
        for name in os.listdir(out_dir):
            if name.startswith(os.path.basename(temp_stem)) and name.endswith(".part"):
                os.remove(os.path.join(out_dir, name))

    duration = info.get("duration")
    if duration is None:
        raise RuntimeError("yt-dlp reports no duration for this video")
    downloads = info.get("requested_downloads") or []
    if len(downloads) != 1:
        raise RuntimeError(f"expected one downloaded file, yt-dlp reports {len(downloads)}")
    temp_path = downloads[0]["filepath"]
    ext = downloads[0]["ext"]
    final_path = os.path.join(out_dir, f"{video_id}.{ext}")
    os.replace(temp_path, final_path)

    json.dump(
        {
            "file": final_path,
            "format": ext,
            "durationSec": float(duration),
            "title": info.get("title") or "",
            "channel": info.get("channel") or info.get("uploader") or "",
            "ytDlpVersion": yt_dlp.version.__version__,
        },
        sys.stdout,
    )


if __name__ == "__main__":
    main()

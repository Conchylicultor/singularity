"""Download one YouTube video's best audio stream, as it is served.

The runPython contract: ONE JSON document on stdin, ONE on stdout, anything
else (progress, warnings) on stderr.

    stdin   {"videoId": "…", "outDir": "…", "bunPath": "…"}
    stdout  {"ok": true, "file", "format", "durationSec", "title", "channel",
             "ytDlpVersion", "attempts"}
          | {"ok": false, "kind", "message", "detail", "attempts"}

- `-f bestaudio` in its native container (webm/opus or m4a/aac): no ffmpeg,
  no post-processing, no fixup.
- YouTube's JavaScript challenges are solved by yt-dlp-ejs on bun, the
  runtime that is already on the machine (`js_runtimes`, passed as a path).
- Downloaded under a temp name in `outDir`, then renamed to `<videoId>.<ext>`,
  so a reader never sees a partial file under the final name.
- googlevideo now and then refuses a freshly signed stream URL with an HTTP
  403 on its first request, and yt-dlp never retries a 403. A fresh
  extraction signs a new URL, which is served, so a refused stream is
  re-extracted and tried again, up to ATTEMPTS times.
- A failure yt-dlp reports is classified and printed as the `ok: false`
  document, exit 0 — see `classify` for the kinds. A non-zero exit is a crash
  (a bug), with its traceback.
"""

import contextlib
import json
import os
import re
import sys
import time

import yt_dlp
from yt_dlp.networking.exceptions import HTTPError, TransportError
from yt_dlp.utils import DownloadError

from youtube_audio._common import StderrLogger, log

# Tries of one video when its stream is refused (HTTP 403), each with a URL
# signed afresh; the pause before each retry.
ATTEMPTS = 3
RETRY_PAUSES_SEC = (1, 3)

# yt-dlp's messages for a video no retry will bring back. Only its extractor's
# English text tells these apart: there is no exception type for them.
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

# YouTube's bot check on this IP: it clears, and every video fails alike.
BOT_CHECK = re.compile(r"confirm you.?re not a bot", re.IGNORECASE)

# What yt-dlp puts before its message: "ERROR: [youtube] <id>: ".
MESSAGE_PREFIX = re.compile(r"^(ERROR:\s*)?(\[\w+\]\s*[A-Za-z0-9_-]+:\s*)?")


class StreamRefused(Exception):
    """The stream URL was refused (HTTP 403) while downloading."""

    def __init__(self, detail: str, format_id: str, client: str) -> None:
        super().__init__(detail)
        self.detail = detail
        self.format_id = format_id
        self.client = client


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


def clean_message(err: DownloadError) -> str:
    """yt-dlp's message, without its `ERROR: [youtube] <id>: ` prefix."""
    return MESSAGE_PREFIX.sub("", str(err.msg)).strip()


def network_cause(err: DownloadError) -> HTTPError | TransportError | None:
    """The network exception behind a DownloadError, if one is."""
    cause = err.exc_info[1] if err.exc_info else None
    seen = 0
    while cause is not None and seen < 8:
        if isinstance(cause, (HTTPError, TransportError)):
            return cause
        cause = getattr(cause, "cause", None) or cause.__cause__
        seen += 1
    return None


def stream_client(info: dict) -> str:
    """The player client a format's URL was signed for (its `c=` param)."""
    match = re.search(r"[?&]c=([A-Za-z_]+)", info.get("url") or "")
    return match.group(1).lower() if match else "unknown"


def classify(err: DownloadError | StreamRefused, attempts: int) -> dict:
    """A failure yt-dlp reported, as the `ok: false` document.

    | kind          | whose        | clears? |
    |---------------|--------------|---------|
    | `unavailable` | this video   | no      | private, removed, age-gated, …
    | `refused`     | this video   | maybe   | stream still 403 after ATTEMPTS, or another download error
    | `blocked`     | this machine | yes     | bot check, rate limit (HTTP 429)
    | `network`     | this machine | yes     | YouTube cannot be reached
    """

    def failure(kind: str, message: str, detail: str) -> dict:
        return {"ok": False, "kind": kind, "message": message, "detail": detail, "attempts": attempts}

    if isinstance(err, StreamRefused):
        return failure(
            "refused",
            f"YouTube refused the audio stream (HTTP 403, format {err.format_id}, "
            f"{err.client} client) on {attempts} fresh tries",
            err.detail,
        )

    detail = clean_message(err)
    if PERMANENT.search(detail):
        return failure("unavailable", detail, detail)
    if BOT_CHECK.search(detail):
        return failure("blocked", "YouTube asks this machine to confirm it is not a bot", detail)
    cause = network_cause(err)
    if isinstance(cause, HTTPError) and cause.status == 429:
        return failure("blocked", "YouTube is rate-limiting this machine (HTTP 429)", detail)
    if isinstance(cause, TransportError):
        return failure("network", f"Cannot reach YouTube: {cause.msg or type(cause).__name__}", detail)
    return failure("refused", detail, detail)


def attempt(options: dict, url: str) -> dict:
    """One extraction (a freshly signed stream URL), then its download.

    Raises StreamRefused when the stream answers 403, and DownloadError for
    anything else yt-dlp reports.
    """
    # Belt and braces: whatever yt-dlp prints must not reach our stdout.
    with contextlib.redirect_stdout(sys.stderr), yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=False)
        try:
            return ydl.process_ie_result(info, download=True)
        except DownloadError as err:
            cause = network_cause(err)
            if isinstance(cause, HTTPError) and cause.status == 403:
                raise StreamRefused(
                    clean_message(err), str(info.get("format_id")), stream_client(info)
                ) from err
            raise


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

    info = None
    for n in range(1, ATTEMPTS + 1):
        try:
            info = attempt(options, url)
            break
        except StreamRefused as refused:
            if n == ATTEMPTS:
                json.dump(classify(refused, n), sys.stdout)
                return
            pause = RETRY_PAUSES_SEC[n - 1]
            log(
                f"stream refused (HTTP 403, format {refused.format_id}, {refused.client} client); "
                f"re-extracting in {pause} s, attempt {n + 1}/{ATTEMPTS}"
            )
            time.sleep(pause)
        except DownloadError as err:
            json.dump(classify(err, n), sys.stdout)
            return
        finally:
            for name in os.listdir(out_dir):
                if name.startswith(os.path.basename(temp_stem)) and name.endswith(".part"):
                    os.remove(os.path.join(out_dir, name))
    assert info is not None

    duration = info.get("duration")
    if duration is None:
        raise RuntimeError("yt-dlp reports no duration for this video")
    downloads = info.get("requested_downloads") or []
    if len(downloads) != 1:
        raise RuntimeError(f"expected one downloaded file, yt-dlp reports {len(downloads)}")
    temp_path = downloads[0]["filepath"]
    # The file written names its container; a re-processed info's
    # requested_downloads carries no `ext`.
    ext = os.path.splitext(temp_path)[1].removeprefix(".")
    if ext == "":
        raise RuntimeError(f"yt-dlp wrote a file with no extension: {temp_path}")
    final_path = os.path.join(out_dir, f"{video_id}.{ext}")
    os.replace(temp_path, final_path)

    json.dump(
        {
            "ok": True,
            "file": final_path,
            "format": ext,
            "durationSec": float(duration),
            "title": info.get("title") or "",
            "channel": info.get("channel") or info.get("uploader") or "",
            "ytDlpVersion": yt_dlp.version.__version__,
            "attempts": n,
        },
        sys.stdout,
    )


if __name__ == "__main__":
    main()

"""Helpers every entry of this package shares.

The runPython contract: ONE JSON document on stdin, ONE on stdout, anything
else (progress, warnings) on stderr. So everything yt-dlp says goes to stderr.
"""

import sys


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

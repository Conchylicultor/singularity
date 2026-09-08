import { closeSync, existsSync, fstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import type {
  AllowVerdict,
  DenyVerdict,
  GuardContext,
  InformVerdict,
  TranscriptRead,
} from "./types";

/**
 * How much of the transcript's tail to read.
 *
 * Transcripts reach tens of MB in a long session and this runs inside a hook,
 * so the read is bounded rather than whole-file. The tail is the right end: a
 * guard asks about something that happened during its own window — at most the
 * last 30 minutes — which no session fills with 64 MB of output.
 */
const TRANSCRIPT_TAIL_BYTES = 64 * 1024 * 1024;

function readTail(path: string): TranscriptRead {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code == null) throw err;
    return { kind: "unavailable", why: `transcript unreadable (${code})` };
  }
  try {
    const size = fstatSync(fd).size;
    const length = Math.min(size, TRANSCRIPT_TAIL_BYTES);
    const buf = Buffer.allocUnsafe(length);
    readSync(fd, buf, 0, length, size - length);
    return { kind: "read", text: buf.toString("utf8") };
  } finally {
    closeSync(fd);
  }
}

export function createContext(
  cwd: string,
  sessionId = "unknown",
  writableDataDirs: readonly string[] = [],
  /**
   * `transcript_path` off the PreToolUse payload. Optional because a caller
   * that isn't the hook (a test, the transcript replay) has no session file —
   * absence surfaces as the `unavailable` arm, never as an empty transcript.
   */
  transcriptPath?: string,
): GuardContext {
  return {
    cwd,
    sessionId,
    writableDataDirs,
    readTranscript(): TranscriptRead {
      if (!transcriptPath)
        return {
          kind: "unavailable",
          why: "no transcript path in the payload",
        };
      return readTail(transcriptPath);
    },
    hasBypass(token: string): boolean {
      return existsSync(join(cwd, token));
    },
    allow(): AllowVerdict {
      return { kind: "allow" };
    },
    deny(reason: string): DenyVerdict {
      return { kind: "deny", reason };
    },
    fatal(reason: string): DenyVerdict {
      return { kind: "deny", reason, fatal: true };
    },
    inform(context: string): InformVerdict {
      return { kind: "inform", context };
    },
  };
}

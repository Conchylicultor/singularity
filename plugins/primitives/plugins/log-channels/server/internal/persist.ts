import { closeSync, fstatSync, openSync, readdirSync, readSync } from "node:fs";
import { join } from "node:path";
import type { ZodType } from "zod";
import { worktreeDataDir } from "@plugins/infra/plugins/paths/server";
import type { LogStream } from "./registry";

// The READ half of the persistent log-channel substrate. The WRITE/rotation half
// now lives in `@plugins/infra/plugins/file-sink` — durable channels back
// themselves with a `defineFileSink` (see `log.ts` / `client-ingress.ts`), which
// owns the bounded-append + rotation the agent reads back here with `tail`/`cat`.

// Replace any char outside [A-Za-z0-9_-] with "_" so a browser-supplied channel
// id can never escape the logs dir (path-traversal guard). Security-load-bearing.
// file-sink has its own copy for `openDynamicSink`; it does NOT export one, so the
// read path (and `defineLogSink`'s path derivation) keep this local copy — the two
// must agree on the on-disk filename, which they do (same regex).
export function sanitizeChannel(channel: string): string {
  return channel.replace(/[^A-Za-z0-9_-]/g, "_");
}

export function logsDirFor(worktree: string): string {
  return join(worktreeDataDir(worktree), "logs");
}

// Resolve THIS worktree's logs dir. Throws loudly when SINGULARITY_WORKTREE is
// unset — a durable sink with no worktree to write into is a bug, not a fallback.
// Shared by the write path (defineLogSink / the client ingress family) and unused
// by the read path (which takes an explicit worktree).
export function logsDir(): string {
  const worktree = process.env.SINGULARITY_WORKTREE;
  if (!worktree) {
    throw new Error(
      "SINGULARITY_WORKTREE is not set — cannot resolve the per-worktree logs directory",
    );
  }
  return logsDirFor(worktree);
}

// Max bytes a tail read pulls off disk via a positioned read, so even a full
// (≤128 MB) live file is never materialized whole into memory.
const READ_TAIL_BYTES = 8 * 1024 * 1024;

// Read path: resolves an ARBITRARY worktree's logs (the MCP handler runs in the
// launching backend, not the target worktree). The filesystem is shared, so
// reading another worktree's files just works — like query_db reaching any
// worktree DB.

export function listChannelsInDir(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  // Rotated files (`channel.jsonl.N`) don't end in `.jsonl`, so they're excluded.
  return names
    .filter((n) => n.endsWith(".jsonl"))
    .map((n) => n.slice(0, -".jsonl".length));
}

export function listChannels(worktree: string): string[] {
  return listChannelsInDir(logsDirFor(worktree));
}

function tryParseEntry(
  line: string,
): { t: number; stream?: LogStream; line: string } | null {
  try {
    return JSON.parse(line);
  } catch (err) {
    if (err instanceof SyntaxError) return null;
    throw err;
  }
}

// Bounded tail read: pull at most the last READ_TAIL_BYTES off disk via a
// positioned read, so even a full (≤128 MB) live file is never materialized
// whole in memory. When we didn't start at offset 0 the first line is (probably)
// partial — drop it. Rotated history (`channel.jsonl.N`) is intentionally NOT
// stitched in: `tail` is a recent-lines request and rotated files are cold; the
// live file's tail is the contract.
export function readTail(
  file: string,
  tail: number,
): { t: number; stream?: LogStream; line: string }[] | null {
  let fd: number;
  try {
    fd = openSync(file, "r");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - READ_TAIL_BYTES);
    const length = size - start;
    const buf = Buffer.allocUnsafe(length);
    let offset = 0;
    while (offset < length) {
      const read = readSync(fd, buf, offset, length - offset, start + offset);
      if (read === 0) break;
      offset += read;
    }
    let text = buf.toString("utf8", 0, offset);
    if (start > 0) {
      const nl = text.indexOf("\n");
      text = nl === -1 ? "" : text.slice(nl + 1);
    }
    const entries: { t: number; stream?: LogStream; line: string }[] = [];
    for (const line of text.split("\n")) {
      if (!line) continue;
      const parsed = tryParseEntry(line);
      // Tolerate corrupt/partial lines (e.g. a half-flushed append).
      if (parsed) entries.push(parsed);
    }
    return entries.slice(-tail);
  } finally {
    closeSync(fd);
  }
}

export function readChannelEntries(
  worktree: string,
  channel: string,
  tail: number,
): { t: number; stream?: LogStream; line: string }[] | null {
  const file = join(logsDirFor(worktree), sanitizeChannel(channel) + ".jsonl");
  return readTail(file, tail);
}

// Read a channel whose payload lines are each a JSON object of type `T`: unwrap
// the log-channel envelope, tolerantly parse the inner JSON, and schema-drop the
// rest. The tolerant parse mirrors `readTail`'s envelope handling one level in — a
// torn tail line (a half-flushed append) is skipped; any other parse error is a
// real bug and rethrown. Invalid-shape lines (old schema, corrupt payload) are
// dropped via `safeParse`.
//
// A missing/empty channel collapses to `[]` — indistinguishable from a channel
// that exists but holds no valid lines. Callers that must tell "no channel yet"
// apart from "channel present but empty" should use `readChannelEntries` directly
// (it returns `null` for a missing file).
export function readChannelJson<T>(
  worktree: string,
  channel: string,
  tail: number,
  schema: ZodType<T>,
): T[] {
  const entries = readChannelEntries(worktree, channel, tail);
  if (!entries) return [];
  const out: T[] = [];
  for (const entry of entries) {
    let obj: unknown;
    try {
      obj = JSON.parse(entry.line);
    } catch (err) {
      // Tolerate a torn tail line; surface anything else.
      if (err instanceof SyntaxError) continue;
      throw err;
    }
    const parsed = schema.safeParse(obj);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

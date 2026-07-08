import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { worktreeDataDir } from "@plugins/infra/plugins/paths/server";
import type { LogStream } from "./registry";

// Persist client/server log lines to a per-worktree JSONL file the agent can
// read with `tail`/`cat`, surviving the backend restart that `./singularity
// build` performs mid-build. The in-memory ring buffer is for the live UI pane;
// durability + agent-readability come from this file.

// Replace any char outside [A-Za-z0-9_-] with "_" so a browser-supplied channel
// id can never escape the logs dir (path-traversal guard). Security-load-bearing.
export function sanitizeChannel(channel: string): string {
  return channel.replace(/[^A-Za-z0-9_-]/g, "_");
}

export function logsDirFor(worktree: string): string {
  return join(worktreeDataDir(worktree), "logs");
}

function logsDir(): string {
  const worktree = process.env.SINGULARITY_WORKTREE;
  if (!worktree) {
    throw new Error(
      "SINGULARITY_WORKTREE is not set — cannot resolve the per-worktree logs directory",
    );
  }
  return logsDirFor(worktree);
}

// Rotation: the live-state.jsonl channel grew to ~4 GB with zero size management.
// Every persisted line funnels through appendEntry, so this is the one place to
// bound it. We gate on an in-memory per-file byte counter rather than a statSync
// on every append — a stat per line would double the syscall cost on this
// synchronous hot path. Cap at 128 MB, keep 3 rotated files.
const MAX_CHANNEL_BYTES = 128 * 1024 * 1024;
const KEEP_ROTATIONS = 3;

// Live-file path → its current byte size (seeded once from disk on first miss).
const channelBytes = new Map<string, number>();

// Rotated files are named `channel.jsonl.N` — the numeric suffix is appended AFTER
// `.jsonl` (NOT `channel.N.jsonl`) so listChannels' `endsWith(".jsonl")` filter
// naturally excludes them and they never surface as bogus channels.
function rotationPath(dir: string, channel: string, n: number): string {
  return join(dir, sanitizeChannel(channel) + ".jsonl." + String(n));
}

function unlinkIfExists(path: string): void {
  try {
    unlinkSync(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

function renameIfExists(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

// Shift the rotation window down and move the live file into slot .1. Net effect:
// at most KEEP_ROTATIONS rotated files survive; the next appendFileSync recreates a
// fresh `channel.jsonl`. renameSync is atomic within a dir; ENOENT is tolerated on
// every slot (a rotation slot may not exist yet), but any other error rethrows.
export function rotateChannel(dir: string, channel: string): void {
  const live = join(dir, sanitizeChannel(channel) + ".jsonl");
  // Drop the oldest rotation first, then shift .(K-1)→.K … .1→.2, then live→.1.
  unlinkIfExists(rotationPath(dir, channel, KEEP_ROTATIONS));
  for (let i = KEEP_ROTATIONS - 1; i >= 1; i--) {
    renameIfExists(rotationPath(dir, channel, i), rotationPath(dir, channel, i + 1));
  }
  renameIfExists(live, rotationPath(dir, channel, 1));
}

// Core append + size-gate, parameterized on the logs dir and cap so it is testable
// hermetically (the real appendEntry resolves the per-worktree dir and uses the
// production cap).
export function appendEntryToDir(
  dir: string,
  channel: string,
  entry: { t: number; stream?: LogStream; line: string },
  maxBytes: number = MAX_CHANNEL_BYTES,
): void {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, sanitizeChannel(channel) + ".jsonl");
  const payload =
    JSON.stringify({ t: entry.t, stream: entry.stream, line: entry.line }) + "\n";
  const lineBytes = Buffer.byteLength(payload, "utf8");

  let size = channelBytes.get(file);
  if (size === undefined) {
    try {
      size = statSync(file).size;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      size = 0;
    }
  }

  if (size + lineBytes > maxBytes) {
    // Rotate first, then write into the fresh file; the counter restarts at this line.
    rotateChannel(dir, channel);
    appendFileSync(file, payload);
    channelBytes.set(file, lineBytes);
    return;
  }

  appendFileSync(file, payload);
  channelBytes.set(file, size + lineBytes);
}

export function appendEntry(
  channel: string,
  entry: { t: number; stream?: LogStream; line: string },
): void {
  appendEntryToDir(logsDir(), channel, entry);
}

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

export function readChannelEntries(
  worktree: string,
  channel: string,
  tail: number,
): { t: number; stream?: LogStream; line: string }[] | null {
  const file = join(logsDirFor(worktree), sanitizeChannel(channel) + ".jsonl");
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const entries: { t: number; stream?: LogStream; line: string }[] = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    const parsed = tryParseEntry(line);
    // Tolerate corrupt/partial lines (e.g. a half-flushed append).
    if (parsed) entries.push(parsed);
  }
  return entries.slice(-tail);
}

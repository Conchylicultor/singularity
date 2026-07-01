import { appendFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
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

export function appendEntry(
  channel: string,
  entry: { t: number; stream?: LogStream; line: string },
): void {
  const dir = logsDir();
  mkdirSync(dir, { recursive: true });
  const file = join(dir, sanitizeChannel(channel) + ".jsonl");
  appendFileSync(
    file,
    JSON.stringify({ t: entry.t, stream: entry.stream, line: entry.line }) + "\n",
  );
}

// Read path: resolves an ARBITRARY worktree's logs (the MCP handler runs in the
// launching backend, not the target worktree). The filesystem is shared, so
// reading another worktree's files just works — like query_db reaching any
// worktree DB.

export function listChannels(worktree: string): string[] {
  let names: string[];
  try {
    names = readdirSync(logsDirFor(worktree));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return names
    .filter((n) => n.endsWith(".jsonl"))
    .map((n) => n.slice(0, -".jsonl".length));
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

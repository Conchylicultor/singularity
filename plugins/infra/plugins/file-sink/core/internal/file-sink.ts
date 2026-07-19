import { appendFileSync, mkdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
// Relative sibling import, not the `@plugins/infra/plugins/file-sink/core` alias:
// this file now lives INSIDE that barrel's plugin, so the alias form would cycle
// back through the barrel that re-exports it.
import type { FileSink, FileSinkSpec, RotateBound } from "./types";
import type { JsonlTailResult, TailOptions, TailResult } from "./read";
import { readJsonlTail, readTail } from "./read";

// The bounded-append / rotation primitive, extracted from
// log-channels/server/internal/persist.ts. Node-only: `node:fs` + `node:path`,
// NO `db`, NO `jobs` — so a short-lived CLI process (no server, no DB) can import
// it and still get a size-bounded file. The caller supplies an ABSOLUTE path; the
// JSON envelope (or any other line encoding) is the caller's concern — `append`
// is generic and writes `line + "\n"` verbatim.

// Defaults match persist.ts's historical constants: the live-state.jsonl channel
// grew to ~4 GB with zero size management, so every sink caps at 128 MB and keeps
// 3 rotated files.
const DEFAULT_MAX_BYTES = 128 * 1024 * 1024;
const DEFAULT_KEEP = 3;

// Replace any char outside [A-Za-z0-9_-] with "_" so an open-ended, externally
// supplied name (a browser `clientLog` channel id) can never escape its dir
// (path-traversal guard). Security-load-bearing. `defineFileSink` does NOT
// sanitize — its `path` is caller-owned and trusted; only `openDynamicSink`, the
// one open-ended family, sanitizes an untrusted name.
export function sanitizeChannel(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, "_");
}

// Rotated files are named `path.N` — the numeric suffix is appended AFTER the
// full live path (so a `foo.jsonl` live file rotates to `foo.jsonl.1`, and a
// `endsWith(".jsonl")` listing filter naturally excludes the rotations).
function rotationPath(path: string, n: number): string {
  return path + "." + String(n);
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
// at most `keep` rotated files survive; the next appendFileSync recreates a fresh
// live file. renameSync is atomic within a dir; ENOENT is tolerated on every slot
// (a rotation slot may not exist yet), but any other error rethrows.
function rotateFile(path: string, keep: number): void {
  // Drop the oldest rotation first, then shift .(K-1)→.K … .1→.2, then live→.1.
  unlinkIfExists(rotationPath(path, keep));
  for (let i = keep - 1; i >= 1; i--) {
    renameIfExists(rotationPath(path, i), rotationPath(path, i + 1));
  }
  renameIfExists(path, rotationPath(path, 1));
}

// Live-file path → its current byte size (seeded once from disk on first miss).
// We gate on this in-memory per-file counter rather than a `statSync` on every
// append — a stat per line would double the syscall cost on this synchronous hot
// path. Process-global so repeated `append`s to the same path stay cheap.
const fileBytes = new Map<string, number>();

function appendLine(path: string, line: string, maxBytes: number, keep: number): void {
  mkdirSync(dirname(path), { recursive: true });
  const payload = line + "\n";
  const lineBytes = Buffer.byteLength(payload, "utf8");

  let size = fileBytes.get(path);
  if (size === undefined) {
    try {
      size = statSync(path).size;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      size = 0;
    }
  }

  if (size + lineBytes > maxBytes) {
    // Rotate first, then write into the fresh file; the counter restarts at this line.
    rotateFile(path, keep);
    appendFileSync(path, payload);
    fileBytes.set(path, lineBytes);
    return;
  }

  appendFileSync(path, payload);
  fileBytes.set(path, size + lineBytes);
}

function makeSink(id: string, path: string, maxBytes: number, keep: number): FileSink {
  const bound: RotateBound = { kind: "rotate", maxBytes, keep };
  return {
    id,
    path,
    bound,
    append(line: string): void {
      appendLine(path, line, maxBytes, keep);
    },
    // The read budget is deliberately NOT derived from `maxBytes`: a default sink
    // is 128 MB × 3, so `bound`-derived defaults would mean a 512 MB read. The
    // reader carries its own 8 MB default; a caller that wants more says so.
    readTail(opts?: TailOptions): TailResult {
      return readTail(path, opts);
    },
    readJsonlTail<T>(opts?: TailOptions): JsonlTailResult<T> {
      return readJsonlTail<T>(path, opts);
    },
  };
}

// id → sink. Module-level ⇒ process-global; populated as a side effect of the
// declaring calls at consumer module eval (i.e. boot import phase).
const sinks = new Map<string, FileSink>();

/**
 * Declare a bounded-append file sink for `spec.path`.
 *
 * Mirrors `declareGrowthBound`'s exactly-once discipline: a sink is declared
 * EXACTLY ONCE, so ANY re-declaration of the same id throws — two owners claiming
 * one id is an authoring bug, and silently keeping one entry would hide it.
 */
export function defineFileSink(spec: FileSinkSpec): FileSink {
  const existing = sinks.get(spec.id);
  if (existing) {
    throw new Error(
      `[file-sink] sink "${spec.id}" is already defined ` +
        `(path ${existing.path}); a file sink is declared exactly once. ` +
        `Attempted to re-declare it at ${spec.path}. ` +
        `Remove the duplicate defineFileSink.`,
    );
  }
  const sink = makeSink(
    spec.id,
    spec.path,
    spec.maxBytes ?? DEFAULT_MAX_BYTES,
    spec.keep ?? DEFAULT_KEEP,
  );
  sinks.set(spec.id, sink);
  return sink;
}

/** A copy of the sink registry — callers never hold the live map. */
export function getFileSinks(): ReadonlyMap<string, FileSink> {
  return new Map(sinks);
}

/**
 * Open a sink for an OPEN-ENDED, externally supplied name (a browser `clientLog`
 * channel id). Same rotation, but the name is sanitized into `dir` and the sink
 * is NOT added to the registry — the whole family is covered by ONE declared
 * bound (registered once by the log-channels plugin), so registering each dynamic
 * id would be an unbounded registry, not a bounded one.
 */
export function openDynamicSink(dir: string, name: string): FileSink {
  const path = join(dir, sanitizeChannel(name) + ".jsonl");
  return makeSink(name, path, DEFAULT_MAX_BYTES, DEFAULT_KEEP);
}

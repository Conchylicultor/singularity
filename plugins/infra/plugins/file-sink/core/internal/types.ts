// The shared shape of a bounded-append file sink.
//
// `core/` here means RUNTIME-NEUTRAL NODE, not web-safe: the impl next door owns
// `node:fs`. This plugin must never be imported from `web/`.

import type { JsonlTailResult, TailOptions, TailResult } from "./read";

/** Declaration of a file sink. `path` is an ABSOLUTE live-file path the caller owns. */
export interface FileSinkSpec {
  /** Stable, unique id — the registry key and the `file:${id}` growth-bound key. */
  id: string;
  /** Human-readable purpose of the sink (for the undeclared-growth monitor). */
  description: string;
  /** Absolute path of the live file. Rotations are `path.1` … `path.N`. */
  path: string;
  /** Rotate once the live file would exceed this. Defaults to 128 MB. */
  maxBytes?: number;
  /** How many rotated files to keep (`path.1` … `path.keep`). Defaults to 3. */
  keep?: number;
}

/**
 * A rotation bound. TRUE by construction: `append()` IS the rotation, so a sink
 * that exists is a sink whose file is bounded — there is no "declared but
 * unbounded" state to represent. Structurally identical to retention's
 * `GrowthBound` `rotate` constructor, so a sink's bound is a growth bound.
 */
export interface RotateBound {
  kind: "rotate";
  maxBytes: number;
  keep: number;
}

/** A live, bounded-append file sink. `append` writes `line + "\n"`, rotating at the cap. */
export interface FileSink {
  id: string;
  path: string;
  bound: RotateBound;
  append(line: string): void;
  /**
   * Bounded tail read of this sink's own file — the read counterpart of `append`.
   * Binding it to the sink removes the chance of reading a sink from the wrong
   * path. Same semantics as the free `readTail(path, opts)`; the read budget comes
   * from `opts` (8 MB default), NOT from `bound.maxBytes`.
   */
  readTail(opts?: TailOptions): TailResult;
  /** `readTail` with each line tolerantly `JSON.parse`d into a `T`. */
  readJsonlTail<T>(opts?: TailOptions): JsonlTailResult<T>;
}

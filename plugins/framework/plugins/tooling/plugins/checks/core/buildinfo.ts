// Reading a `.tsbuildinfo`: which files the program loaded, and what tsc
// recorded their contents as.
//
// Two readers need exactly this and nothing more — the per-target program key
// (`type-check/check/program-key.ts`), which asks "is this the same program?",
// and the warm-base scorer (`./warm-base.ts`), which asks "how much of this
// candidate base still matches the tree?". They live in different plugins, so
// the reading lives here, in the parent both can reach.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * What a target's `.tsbuildinfo` could tell us about its last program.
 *
 * A discriminated result rather than a nullable list, because the three arms
 * mean genuinely different things and the callers act on the difference: a
 * cold target is normal, an unreadable buildinfo is worth naming in the log,
 * and only `files` may be keyed or scored on. A `null` — or worse an empty
 * array — would flatten all three into one shape, and an empty array would
 * mint a key describing an empty program that matches every other empty
 * program.
 */
export type ProgramFileList =
  | {
      kind: "files";
      /** Absolute paths, resolved against the caller's base (see below). */
      files: string[];
      /**
       * `versions[i]` is what tsc recorded for `files[i]`: the sha256 hex of
       * that file's text at the time the buildinfo was written, or `undefined`
       * when this buildinfo carries no version for it.
       *
       * Parallel to `files` by construction — both come out of one pass over
       * the same two arrays — so an index that is valid in one is valid in the
       * other.
       */
      versions: (string | undefined)[];
    }
  /** No buildinfo on disk yet: the cold case, and the common one. */
  | { kind: "absent" }
  /** A buildinfo that is there but says nothing usable (torn, or a shape we do not know). */
  | { kind: "unreadable"; why: string };

/**
 * The files the program loaded on its last run, as recorded in the
 * `.tsbuildinfo` tsc wrote — repo files and `node_modules` files alike.
 *
 * PATHS IN A BUILDINFO ARE RELATIVE TO THE BUILDINFO FILE'S OWN DIRECTORY,
 * which is why that is the default. Resolving them against anything else (the
 * repo root, the cwd) yields paths that exist nowhere, which reads as "every
 * file changed" rather than as an error — the exact trap that cost the
 * 2026-09-08 measurement two rounds.
 *
 * `resolveBase` is the ONE case where the default is wrong: scoring a POOLED
 * candidate asks "how well would this base fit if it sat at this worktree's
 * `.cache/tsbuildinfo/`?", so its paths must resolve against that destination
 * directory, not against the pool directory it is being read from. Getting
 * that wrong is silent — every path misses, the candidate scores zero, and the
 * pool looks useless — so the destination is passed explicitly rather than
 * inferred.
 */
export function readProgramFileList(
  buildInfoPath: string,
  resolveBase: string = dirname(buildInfoPath),
): ProgramFileList {
  let text: string;
  try {
    text = readFileSync(buildInfoPath, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // Not there, or not reachable, is the cold case. Anything else — a bad fd,
    // an I/O error — is a real fault and belongs to whoever can act on it.
    if (code !== "ENOENT" && code !== "EACCES" && code !== "ENOTDIR") throw err;
    return { kind: "absent" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    // A buildinfo half-written by a worker that died mid-write is expected on a
    // machine that gets killed; any other throw from JSON.parse is not.
    if (!(err instanceof SyntaxError)) throw err;
    return { kind: "unreadable", why: "buildinfo is not valid JSON" };
  }
  const doc = parsed as {
    fileNames?: unknown;
    fileInfos?: unknown;
    program?: { fileNames?: unknown; fileInfos?: unknown };
  };
  const names = doc.fileNames ?? doc.program?.fileNames;
  if (!Array.isArray(names) || !names.every((n) => typeof n === "string")) {
    return {
      kind: "unreadable",
      why: "buildinfo has no fileNames string array",
    };
  }
  const infos = doc.fileInfos ?? doc.program?.fileInfos;
  // `fileInfos` is optional, and a shape we do not recognise is simply no
  // version — never a reason to reject a file list we CAN read, because the
  // program key only needs the names and would lose a whole target over it.
  const infoList = Array.isArray(infos) ? infos : [];
  return {
    kind: "files",
    files: (names as string[]).map((n) => resolve(resolveBase, n)),
    versions: (names as string[]).map((_, i) => versionOf(infoList[i])),
  };
}

/**
 * The content version tsc recorded for one file.
 *
 * Two shapes, both current: a bare string is the version itself (tsc's
 * shorthand for a file with nothing else to say), and an object carries it
 * under `version` alongside `signature` / `affectsGlobalScope` /
 * `impliedFormat`. Anything else is `undefined` — unknown, not zero.
 */
function versionOf(info: unknown): string | undefined {
  if (typeof info === "string") return info;
  if (typeof info === "object" && info !== null) {
    const v = (info as { version?: unknown }).version;
    if (typeof v === "string") return v;
  }
  return undefined;
}

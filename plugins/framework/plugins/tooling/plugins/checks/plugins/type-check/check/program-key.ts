// A content key for ONE tsc target's program, and the host-global record of
// which such programs have passed.
//
// Why per-target at all: a miss on the outer (whole-check) cache rebuilds all
// seven programs, and the same file is checked 3.7 times per miss — the five
// node-side programs are near-copies of one another, and `test` contains
// everything but 301 files. An edit under a plugin's `web/` cannot change the
// verdict of `server-core`, yet `server-core` is rebuilt anyway. The key below
// says, per target, "this exact program passed before", so the worker for an
// unaffected target has nothing to do.
//
// THIS KEY DECIDES WHETHER A WORKER RUNS. A recorded match means tsc is not
// invoked for that target at all, so the key IS the verdict for it — there is
// no compiler behind it to catch a key that was too loose. That is why the
// envelope below is spelled out in full, and why anything unclear (no
// buildinfo, a shape we do not recognise) yields NO key and a cold run rather
// than a guess. Design and measurements:
// research/2026-09-08-global-type-check-per-target-program-skip.md.
//
// Soundness, in one paragraph. A program is a function of (roots, file
// contents, compiler options). `L_t` — the `fileNames` tsc itself wrote into
// the target's `.tsbuildinfo` — is the exact set of files the program loaded on
// some earlier tree. If every file in `L_t` has identical content now and the
// roots are identical, module resolution runs the same and yields the same
// program, hence the same verdict. Roots are covered by `R_t`; options by the
// tsconfig contents; `node_modules` contents are hashed directly rather than
// trusted through `bun.lock`, which closes the hand-patched-dependency hole;
// the worker's own behaviour is code, covered by `selfSourceHash`. The one way
// resolution can change with no content in `L_t` changing is a NEWLY ADDED file
// shadowing a resolution (`foo.ts` appearing beside `foo/index.ts`), which
// `allTsNames` closes by over-invalidating on any added or removed TypeScript
// file anywhere.
//
// The one edge outside the envelope, stated so nobody has to rediscover it: a
// file ADDED inside `node_modules` with no lockfile change. Modified dependency
// files are caught (their contents are hashed directly), removed ones too (the
// hash becomes `"-"`), and any real `bun install` rewrites `bun.lock`, which is
// in the key. Only a file hand-copied into `node_modules` can shadow a
// resolution invisibly — and enumerating a hundred thousand dependency paths on
// every run to close that is not a trade worth making.

import { createHash } from "crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { dirname, join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { programPassDir } from "../data-dirs";
import { findFiles, type TreeListing } from "./fingerprint";
import { openPassSet, type PassSetBounds } from "./pass-set";

// Entries are per (target, program key) — at most a handful per run, against
// the closure cache's thousands — so the count bound is a formality and the
// 14-day age bound does the evicting. Same shape as the closure cache so the
// two stores are read the same way.
const BOUNDS: PassSetBounds = {
  maxAgeMs: 14 * 24 * 60 * 60 * 1000,
  maxEntries: 20000,
  trimTo: 16000,
  pruneIntervalMs: 60 * 60 * 1000,
};

/**
 * The files whose content the key folds in ON TOP of the program's own loaded
 * set: every `tsconfig*.json` (compiler options, path aliases, the `extends`
 * chain), every `package.json` outside `node_modules`, the lockfile, and every
 * ambient `.d.ts`.
 *
 * Deliberately NARROWER than the lint closure fingerprint's trigger set: the
 * lint-only globals (`eslint.config.ts`, `plugins/**\/lint/**`,
 * `*.lint.generated.ts`) are excluded, so changing a lint rule no longer flips
 * every program's TSC key.
 *
 * Dropping them is safe WITHOUT a second mechanism, and the reason is worth
 * stating: a lint-rule edit flips `globalConfigFingerprint`, which flips every
 * file's closure fingerprint, which empties the closure cache — so every
 * target's `lintByTarget` bucket is non-empty and the skip clause refuses every
 * target anyway. The narrowing only removes a redundancy; it cannot let a
 * lint-rule change go unchecked.
 */
function isTscTrigger(rel: string): boolean {
  const base = rel.split("/").pop()!;
  if (base.startsWith("tsconfig") && base.endsWith(".json")) return true;
  if (base === "package.json") return true;
  if (rel === "bun.lock" || rel === "bun.lockb") return true;
  if (rel.endsWith(".d.ts")) return true;
  return false;
}

/**
 * Every `.ts` / `.tsx` in the repo, INCLUDING the `*.generated.ts` the lint
 * universe ignores: a generated registry is a tsc root, and an added one can
 * shadow a resolution just as any other file can.
 */
function isTsName(rel: string): boolean {
  return rel.endsWith(".ts") || rel.endsWith(".tsx");
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** sha256 of a file's BYTES; `"-"` for a path that is absent or unreadable. */
function hashFileBytes(abs: string): string {
  try {
    if (!statSync(abs).isFile()) return "-";
    return createHash("sha256").update(readFileSync(abs)).digest("hex");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "EACCES" && code !== "ENOTDIR") throw err;
    return "-";
  }
}

/**
 * What a target's `.tsbuildinfo` could tell us about its last program.
 *
 * A discriminated result rather than a nullable list, because the three arms
 * mean genuinely different things and the caller acts on the difference: a
 * cold target is normal, an unreadable buildinfo is worth naming in the log,
 * and only `files` may be keyed on. A `null` — or worse an empty array — would
 * flatten all three into one shape, and an empty array would mint a key
 * describing an empty program that matches every other empty program.
 */
export type ProgramFileList =
  | { kind: "files"; files: string[] }
  /** No buildinfo on disk yet: the cold case, and the common one. */
  | { kind: "absent" }
  /** A buildinfo that is there but says nothing usable (torn, or a shape we do not know). */
  | { kind: "unreadable"; why: string };

/**
 * The absolute paths of every file the target's program loaded on its last run,
 * read out of the `.tsbuildinfo` tsc wrote — repo files and `node_modules`
 * files alike.
 *
 * PATHS IN A BUILDINFO ARE RELATIVE TO THE BUILDINFO FILE'S OWN DIRECTORY.
 * Resolving them against anything else (the repo root, the cwd) yields paths
 * that exist nowhere, which reads as "every file changed" rather than as an
 * error — the exact trap that cost the 2026-09-08 measurement two rounds.
 */
export function readProgramFileList(buildInfoPath: string): ProgramFileList {
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
    program?: { fileNames?: unknown };
  };
  const names = doc.fileNames ?? doc.program?.fileNames;
  if (!Array.isArray(names) || !names.every((n) => typeof n === "string")) {
    return {
      kind: "unreadable",
      why: "buildinfo has no fileNames string array",
    };
  }
  const base = dirname(buildInfoPath);
  return {
    kind: "files",
    files: (names as string[]).map((n) => resolve(base, n)),
  };
}

let cachedSelfSourceHash: string | null = null;

/**
 * A hash of THIS check's own source — every `.ts` under the plugin's `check/`
 * and `shared/`, plus the target discovery it depends on.
 *
 * Without it, editing the worker (say, adding a diagnostic category) would leave
 * every recorded PASS looking valid, and the new behaviour would be skipped over
 * on exactly the trees that most needed re-running.
 *
 * Files are named by their path RELATIVE to the plugin, never absolutely: the
 * pass set is host-global, and an absolute path carries the worktree's name, so
 * an absolute spelling would make every worktree's key unique and the whole
 * store useless while still looking like it worked.
 */
export function selfSourceHash(): string {
  if (cachedSelfSourceHash !== null) return cachedSelfSourceHash;
  const pluginDir = fileURLToPath(new URL("..", import.meta.url));
  const parts: string[] = [];
  for (const sub of ["check", "shared"]) {
    const dir = join(pluginDir, sub);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      if (name.endsWith(".ts")) {
        parts.push(`${sub}/${name}\0${hashFileBytes(join(dir, name))}`);
      }
    }
  }
  const discover = fileURLToPath(
    new URL("../../../core/discover.ts", import.meta.url),
  );
  parts.push(`checks/core/discover.ts\0${hashFileBytes(discover)}`);
  return (cachedSelfSourceHash = sha256(parts.join("\n")));
}

/**
 * Everything a program key needs that is the SAME for every target, computed
 * once per run: the tsc-relevant trigger contents, the name-only census of the
 * repo's TypeScript (the shadowing guard), and this check's own source hash.
 */
export interface ProgramKeyContext {
  root: string;
  /** Memoised `abs -> content hash`, shared by every target (the programs overlap heavily). */
  contentHash: Map<string, string>;
  sharedPrefix: string;
}

export function openProgramKeyContext(listing: TreeListing): ProgramKeyContext {
  const triggers = findFiles(listing, isTscTrigger).map(
    (rel) => `${rel}\0${hashFileBytes(join(listing.root, rel))}`,
  );
  // Names only: an ADDED or REMOVED `.ts` anywhere can change how an unchanged
  // import specifier resolves, and no content hash of an existing file would
  // show it. Over-invalidating on every add/remove is the cheap safe side.
  const allTsNames = findFiles(listing, isTsName);
  return {
    root: listing.root,
    contentHash: new Map(),
    sharedPrefix: [
      "v1",
      selfSourceHash(),
      sha256(triggers.join("\n")),
      sha256(allTsNames.join("\n")),
    ].join("\n"),
  };
}

/**
 * A target's program key, or the reason there is none.
 *
 * "No key" is not a failure — a cold target simply has no earlier program to
 * compare against — but it is not a key either, and the caller must not be able
 * to confuse the two. The `why` is what the check prints so an operator can see
 * WHICH targets could not be keyed and whether that is expected.
 */
export type ProgramKeyResult =
  { kind: "key"; key: string } | { kind: "none"; why: string };

/**
 * The content key of one target's program.
 *
 * `roots` is the tsconfig's own include-expansion (`R_t`), which pins WHICH
 * program this is; the buildinfo's file list is what that program actually
 * loaded (`L_t`), which pins what it saw.
 */
export function programKey(
  ctx: ProgramKeyContext,
  target: { name: string; tsconfigPath: string; buildInfoPath: string },
  roots: string[],
): ProgramKeyResult {
  const listed = readProgramFileList(target.buildInfoPath);
  if (listed.kind === "absent") {
    return { kind: "none", why: "no buildinfo yet" };
  }
  if (listed.kind === "unreadable") return { kind: "none", why: listed.why };
  const hashOf = (abs: string): string => {
    let h = ctx.contentHash.get(abs);
    if (h === undefined) ctx.contentHash.set(abs, (h = hashFileBytes(abs)));
    return h;
  };
  const rel = (abs: string): string =>
    relative(ctx.root, abs).split(sep).join("/");
  const body = [...listed.files]
    .sort()
    .map((abs) => `${rel(abs)}\0${hashOf(abs)}`)
    .join("\n");
  return {
    kind: "key",
    key: sha256(
      [
        ctx.sharedPrefix,
        rel(target.tsconfigPath),
        sha256([...roots].sort().map(rel).join("\n")),
        body,
      ].join("\n"),
    ),
  };
}

export interface ProgramPasses {
  /** True iff this exact program key was recorded green before, by any worktree. */
  has(targetName: string, key: string): boolean;
  record(targetName: string, key: string): void;
}

/** Open the host-global record of per-target program PASSes. */
export function openProgramPasses(): ProgramPasses {
  const set = openPassSet(programPassDir, BOUNDS);
  return {
    has: (targetName, key) => set.has(`${targetName}:${key}`),
    record: (targetName, key) =>
      set.record(`${targetName}:${key}`, { target: targetName, key }),
  };
}

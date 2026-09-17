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
import { existsSync, readdirSync } from "fs";
import { join, relative, sep } from "path";
import { fileURLToPath } from "url";
import {
  hashFileBytes,
  hashFileCached,
  readProgramFileList,
  type ContentHashMemo,
} from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { listNamedCompositionRegistries } from "@plugins/framework/plugins/tooling/plugins/codegen/core";
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
  /**
   * Memoised `abs -> content hash`, shared by every target (the programs
   * overlap heavily) AND with whoever opened the context.
   *
   * The warm-base selection hashes most of these same files moments earlier to
   * score the pool, so the run passes ONE memo through both steps: the reads
   * are paid once, and both steps necessarily answered from the same reading
   * of the tree.
   */
  contentHash: ContentHashMemo;
  sharedPrefix: string;
}

export function openProgramKeyContext(
  listing: TreeListing,
  contentHash: ContentHashMemo = new Map(),
): ProgramKeyContext {
  const triggers = findFiles(listing, isTscTrigger).map(
    (rel) => `${rel}\0${hashFileCached(contentHash, join(listing.root, rel))}`,
  );
  // Names only: an ADDED or REMOVED `.ts` anywhere can change how an unchanged
  // import specifier resolves, and no content hash of an existing file would
  // show it. Over-invalidating on every add/remove is the cheap safe side.
  //
  // `listing` is what git knows about, which is the right universe everywhere
  // else — but NOT here, and this is the one place the difference bites. The
  // per-composition registries (`web.composition.sonata.generated.ts` and its
  // siblings) are gitignored, yet they sit inside a tsconfig `include` and tsc
  // compiles them. Two of them exist on `main` right now. Left out, this census
  // would stop noticing when one appears or vanishes — and this key is what
  // decides whether tsc runs for a target at all, so there would be no compiler
  // behind it to catch the miss.
  //
  // The list comes from the WRITER's own function, not from a glob retyped
  // here: `listNamedCompositionRegistries` is what the codegen stage uses to
  // sweep these same files, so the reader and the writer cannot drift about
  // where they live or how they are spelled.
  const allTsNames = [
    ...findFiles(listing, isTsName),
    ...listNamedCompositionRegistries(listing.root).map((r) =>
      relative(listing.root, r.file).split(sep).join("/"),
    ),
  ].sort();
  return {
    root: listing.root,
    contentHash,
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
  const rel = (abs: string): string =>
    relative(ctx.root, abs).split(sep).join("/");
  const body = [...listed.files]
    .sort()
    .map((abs) => `${rel(abs)}\0${hashFileCached(ctx.contentHash, abs)}`)
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

// Dependency-closure fingerprints for the eslint check.
//
// Each file's type-aware lint result depends on the file PLUS everything it
// transitively imports (type info flows through forward import edges) PLUS the
// global lint configuration (eslint.config.ts, lint rules, tsconfig, deps,
// ambient declarations). The closure fingerprint folds all of that into one
// content-addressed key, so a PASS recorded for that key is reusable across
// runs and worktrees with an identical closure.

import { createHash } from "crypto";
import { readdirSync } from "fs";
import { join, relative, sep } from "path";
import type { ImportGraphs } from "./import-graph";
import { safeRead } from "./import-graph";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export interface FingerprintResult {
  global: string; // globalConfigFingerprint(root)
  perFile: Map<string, string>; // relpath -> closureFingerprint
}

// The "force-full" trigger files: those whose change can alter the lint result
// of *any* file. These form the global config component, so a
// config/rule/tsconfig/deps/ambient change flips every per-file fingerprint at
// once (replacing the old mtime-based bustCacheIfStale).
const IGNORED_DIR_NAMES = new Set(["node_modules", "dist", ".git"]);

function isGlobalTrigger(rel: string): boolean {
  if (rel === "eslint.config.ts") return true;
  // Any plugins/**/lint/ directory (a path segment `lint/` under plugins/).
  if (rel.startsWith("plugins/")) {
    const segs = rel.split("/");
    if (segs.includes("lint")) return true;
  }
  if (rel.endsWith("lint.generated.ts")) return true;
  // Any tsconfig*.json — root or any plugin.
  const base = rel.split("/").pop()!;
  if (base.startsWith("tsconfig") && base.endsWith(".json")) return true;
  if (rel === "package.json") return true;
  if (rel === "bun.lock" || rel === "bun.lockb") return true;
  if (rel.endsWith(".d.ts")) return true;
  return false;
}

/**
 * One reading of "what files does this tree contain", taken once and passed to
 * everything that asks.
 *
 * ONE traversal, several predicates. A single check pass asks four different
 * questions of the repo's files: the lint closure fingerprint's trigger set,
 * the outer read-set's copy of the same set, the program key's tsc-relevant
 * subset, and the program key's name census. Walked separately those were four
 * full traversals costing seconds — and, worse, four copies of the traversal
 * RULES, so "skip nested worktrees" had four places to drift from.
 *
 * A VALUE rather than a memo behind the function, because a snapshot of a
 * changing filesystem needs a visible lifetime. As a module-level cache its
 * staleness window was "the rest of the process", invisible at every call site;
 * as a value, whoever wants a fresh reading takes one.
 */
export interface TreeListing {
  root: string;
  /** Every file under `root`, repo-relative, deduped and sorted. */
  files: string[];
}

/**
 * Walk `root` (skipping `node_modules`, build output, `.check-*` scratch and
 * nested worktrees) and record every file it holds.
 */
export function readTreeListing(root: string): TreeListing {
  const out: string[] = [];
  walkFiles(root, root, out);
  return { root, files: [...new Set(out)].sort() };
}

/** The files of a listing whose repo-relative path `matches`. */
export function findFiles(
  listing: TreeListing,
  matches: (rel: string) => boolean,
): string[] {
  return listing.files.filter(matches);
}

function walkFiles(root: string, dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code !== "ENOENT" &&
      (err as NodeJS.ErrnoException).code !== "EACCES" &&
      (err as NodeJS.ErrnoException).code !== "ENOTDIR"
    )
      throw err;
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    const rel = relative(root, full).split(sep).join("/");
    if (e.isDirectory()) {
      if (IGNORED_DIR_NAMES.has(e.name)) continue;
      if (e.name.startsWith(".check-")) continue;
      if (rel === ".claude/worktrees" || rel.startsWith(".claude/worktrees/"))
        continue;
      walkFiles(root, full, out);
    } else if (e.isFile()) {
      out.push(rel);
    }
  }
}

/**
 * sha256 over the sorted `"<rel>\0<ch(rel)>"` of every file matching the
 * isForceFull trigger list (eslint.config.ts, plugins/**\/lint/**, tsconfig*.json,
 * package.json, bun.lock(b), *.d.ts, *.lint.generated.ts). A change to any of
 * these flips this component → every closure fingerprint changes → whole cache
 * invalidated.
 */
export function globalConfigFingerprint(listing: TreeListing): string {
  const parts = findFiles(listing, isGlobalTrigger).map(
    (rel) => `${rel}\0${sha256(safeRead(join(listing.root, rel)) ?? "")}`,
  );
  return sha256(parts.join("\n"));
}

/**
 * The full list of global-trigger files (the SAME set `globalConfigFingerprint`
 * folds into its single hash: eslint.config.ts, plugins/**\/lint/**,
 * tsconfig*.json, package.json, bun.lock(b), *.d.ts, *.lint.generated.ts). For
 * callers that must record each trigger as an INDIVIDUAL input fact rather than
 * one opaque hash — type-check's outer input-keyed read-set records a per-file
 * `(path, blobSha)` fact for each, so a compiler-version bump (package.json /
 * bun.lock) or a tsconfig/eslint edit invalidates. Reuses `findFiles` /
 * `isGlobalTrigger`, so the recorded set can never drift from what the
 * fingerprint covers. Deduped + sorted for determinism.
 */
export function findGlobalTriggerFiles(listing: TreeListing): string[] {
  return findFiles(listing, isGlobalTrigger);
}

/**
 * Compute the closure fingerprint for each candidate file:
 *
 *   closure(f) = { f } ∪ transitive forward-closure of f over graphs.forward
 *   fp(f) = sha256(
 *     "g:" + globalConfigFingerprint(root) + "\n" +
 *     sorted( `${c}\0${ch(c)}` for c in closure(f) ).join("\n")
 *   )
 *
 * The closure DFS is memoized and cycle-safe (a visited set), and per-file
 * content hashes ch(rel) are memoized — both shared across all candidates.
 */
export function computeClosureFingerprints(
  listing: TreeListing,
  graphs: ImportGraphs,
  candidates: string[],
): FingerprintResult {
  const { root } = listing;
  const global = globalConfigFingerprint(listing);

  // Memoized per-file content hash: ch(rel) = sha256(content ?? "").
  const contentHash = new Map<string, string>();
  const ch = (rel: string): string => {
    let h = contentHash.get(rel);
    if (h === undefined) {
      h = sha256(safeRead(join(root, rel)) ?? "");
      contentHash.set(rel, h);
    }
    return h;
  };

  // Memoized transitive forward closure (the unordered SET of reachable files,
  // including the file itself). Cycle-safe via the visited set.
  const closureCache = new Map<string, Set<string>>();
  const closureOf = (start: string): Set<string> => {
    const cached = closureCache.get(start);
    if (cached) return cached;
    const visited = new Set<string>();
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const deps = graphs.forward.get(cur);
      if (!deps) continue;
      for (const dep of deps) {
        if (!visited.has(dep)) stack.push(dep);
      }
    }
    closureCache.set(start, visited);
    return visited;
  };

  const perFile = new Map<string, string>();
  for (const f of candidates) {
    const closure = closureOf(f);
    const body = [...closure]
      .sort()
      .map((c) => `${c}\0${ch(c)}`)
      .join("\n");
    perFile.set(f, sha256(`g:${global}\n${body}`));
  }

  return { global, perFile };
}

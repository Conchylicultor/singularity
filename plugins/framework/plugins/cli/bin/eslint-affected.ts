// Affected-set ESLint scope for `./singularity push` (and the build diff-scope).
//
// On push we want to lint only the *affected set* — the changed .ts/.tsx files
// plus every file that transitively imports a changed file — instead of the
// whole repo, while still catching the cross-file type-aware violations a naive
// diff-scope (or even a warm full `eslint .`) would miss. The import graph is a
// sound over-approximation of the type-dependency graph: a file can only be
// type-affected by a change through an import edge (the one exception, ambient/
// global declarations, is handled by a force-full trigger on `.d.ts`).
//
// The import-graph primitives live in the eslint check's runtime `core/` barrel;
// this file imports them and adds only the git diff → affected-set policy on top.

import { existsSync } from "fs";
import { join, sep } from "path";
import {
  buildImportGraphs,
  isLintable,
} from "@plugins/framework/plugins/tooling/plugins/checks/plugins/eslint/core";

// ---------------------------------------------------------------------------
// git helpers
// ---------------------------------------------------------------------------

export async function gitText(cwd: string, args: string[]): Promise<string | null> {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return code === 0 ? out : null;
}

// Build-time eslint scope: the .ts/.tsx files this branch changed vs its
// merge-base with main, so the eslint check lints only those instead of the
// whole repo. A worktree's seeded eslint cache goes fully cold on the first
// build — an eslint content-cache is invalidated wholesale when the config hash
// drifts, and main's eslint.config.ts moves over time — so a full `eslint .`
// re-lints ~2k files (~10 min). Scoping to the diff turns that into seconds.
// Push and `./singularity check` never set the scope env var, so they always run
// the full type-aware lint and the complete gate is preserved. Returns null when
// the diff can't be determined or is too large to be worth scoping (→ caller
// falls back to a full lint); an empty array means nothing lint-relevant changed.
export async function computeEslintScope(root: string): Promise<string[] | null> {
  const mergeBase = await gitText(root, ["merge-base", "HEAD", "main"]);
  if (mergeBase === null) return null;
  const changed = await gitText(root, ["diff", "--name-only", mergeBase.trim()]);
  const untracked = await gitText(root, ["ls-files", "--others", "--exclude-standard"]);
  if (changed === null || untracked === null) return null;
  const files = [...changed.split("\n"), ...untracked.split("\n")]
    .map((f) => f.trim())
    .filter(Boolean)
    // The config lints only **/*.{ts,tsx}; mirror its global ignores so an
    // explicit file list (which bypasses flat-config `ignores`) stays correct.
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .filter((f) => !f.endsWith(".generated.ts"))
    .filter((f) => !f.includes("node_modules/"))
    .filter((f) => !f.includes("/dist/") && !f.startsWith("dist/"))
    // Skip deletions/renames-away — passing a missing path makes eslint error.
    .filter((f) => existsSync(join(root, f)));
  const unique = [...new Set(files)];
  // A sweeping diff (big rebase/refactor) isn't worth scoping — the type
  // programs dominate anyway and the cross-file correctness gap widens.
  if (unique.length > 400) return null;
  return unique;
}

// All repo-relative paths changed on this branch vs its merge-base with main:
// tracked diff + untracked files. Trimmed, deduped, forward-slash. null if git
// fails (caller falls back to a full lint).
export async function changedFilesVsMain(root: string): Promise<string[] | null> {
  const mergeBase = await gitText(root, ["merge-base", "HEAD", "main"]);
  if (mergeBase === null) return null;
  const changed = await gitText(root, ["diff", "--name-only", mergeBase.trim()]);
  const untracked = await gitText(root, ["ls-files", "--others", "--exclude-standard"]);
  if (changed === null || untracked === null) return null;
  const all = [...changed.split("\n"), ...untracked.split("\n")]
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => f.split(sep).join("/"));
  return [...new Set(all)];
}

// ---------------------------------------------------------------------------
// Affected-set policy (push)
// ---------------------------------------------------------------------------

function isForceFull(changed: string[]): boolean {
  for (const f of changed) {
    if (f === "eslint.config.ts") return true;
    // Any plugins/**/lint/ directory (a path segment `lint/` under plugins/).
    if (f.startsWith("plugins/")) {
      const segs = f.split("/");
      if (segs.includes("lint")) return true;
    }
    if (f.endsWith("lint.generated.ts")) return true;
    // Any tsconfig*.json — root or any plugin.
    const base = f.split("/").pop()!;
    if (base.startsWith("tsconfig") && base.endsWith(".json")) return true;
    if (f === "package.json") return true;
    if (f === "bun.lock" || f === "bun.lockb") return true;
    if (f.endsWith(".d.ts")) return true;
  }
  return false;
}

/**
 * Push policy: compute the affected set of lintable files for the current diff,
 * or null when correctness requires a full `eslint .`.
 *
 *  1. changed = files vs main; null → null.
 *  2. Force-full (null) on lint-infra / config / tsconfig / deps / ambient
 *     changes — these can change the result of linting *any* file.
 *  3. BFS the reverse import graph from the changed .ts/.tsx files → affected,
 *     union the changed files themselves.
 *  4. Filter to existing, lintable .ts/.tsx (drop deletions, generated, ignored).
 *  5. Sorted unique list (may be [] → nothing lint-relevant changed → skip).
 */
export async function computeAffectedFiles(root: string): Promise<string[] | null> {
  const changed = await changedFilesVsMain(root);
  if (changed === null) return null;
  if (isForceFull(changed)) return null;

  const reverse = buildImportGraphs(root).reverse;

  // Seed BFS with the changed .ts/.tsx files (only source files participate in
  // the import graph; non-source changes that aren't force-full triggers can't
  // affect lint results).
  const seeds = changed.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

  const affected = new Set<string>(seeds);
  const queue = [...seeds];
  while (queue.length) {
    const cur = queue.shift()!;
    const importers = reverse.get(cur);
    if (!importers) continue;
    for (const imp of importers) {
      if (affected.has(imp)) continue;
      affected.add(imp);
      queue.push(imp);
    }
  }

  const out = [...affected].filter(
    (f) => isLintable(f) && existsSync(join(root, f)),
  );
  return [...new Set(out)].sort();
}

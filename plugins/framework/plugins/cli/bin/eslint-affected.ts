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
// Self-contained: only `fs`/`path` + `Bun.spawn` for git. This is CLI bin code,
// not a plugin barrel, so normal exported functions are fine.

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { dirname, join, relative, resolve, sep } from "path";

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
// Import-graph construction
//
// The extractor below is adapted (copied & specialized to file granularity)
// from the private import-extractor in
// plugins/framework/plugins/tooling/plugins/checks/plugins/plugin-boundaries/check/index.ts
// (extractPluginImports / extractRelativeImports / resolveImport / findSourceFiles).
// We must NOT import from that check (it's a private check file), so the logic
// is duplicated here and resolves specifiers to concrete repo-relative files.
// ---------------------------------------------------------------------------

// Mirror eslint.config.ts ignore globs so the graph covers exactly the linted
// set. The flat-config ignores are:
//   node_modules, dist, .git, .check-*, .claude/worktrees,
//   web-core/dist, **/*.generated.ts
const IGNORED_DIR_NAMES = new Set(["node_modules", "dist", ".git"]);

function isIgnoredRelPath(rel: string): boolean {
  const segs = rel.split("/");
  if (segs.some((s) => s === "node_modules" || s === "dist" || s === ".git")) return true;
  if (segs.some((s) => s.startsWith(".check-"))) return true;
  if (rel.startsWith(".claude/worktrees/")) return true;
  if (rel.endsWith(".generated.ts")) return true;
  return false;
}

function isLintable(rel: string): boolean {
  if (!(rel.endsWith(".ts") || rel.endsWith(".tsx"))) return false;
  return !isIgnoredRelPath(rel);
}

function walkLintFiles(root: string, dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORED_DIR_NAMES.has(e.name)) continue;
      if (e.name.startsWith(".check-")) continue;
      const rel = relative(root, full).split(sep).join("/");
      // Skip .claude/worktrees (nested worktrees) but not other .claude content.
      if (rel === ".claude/worktrees" || rel.startsWith(".claude/worktrees/")) continue;
      walkLintFiles(root, full, out);
    } else if (e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".tsx"))) {
      const rel = relative(root, full).split(sep).join("/");
      if (isLintable(rel)) out.push(rel);
    }
  }
}

function findLintFiles(root: string): string[] {
  const out: string[] = [];
  walkLintFiles(root, root, out);
  return out;
}

function safeRead(absPath: string): string | null {
  try {
    if (!statSync(absPath).isFile()) return null;
    return readFileSync(absPath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Strip only comments (line and block), preserving string-literal contents so
 * module specifiers in imports survive. Maintains line positions.
 * (Copied from plugin-boundaries check.)
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }
    if (c === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < n) {
        out += "  ";
        i += 2;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < n) {
          out += src[i]! + src[i + 1]!;
          i += 2;
          continue;
        }
        out += src[i];
        i++;
      }
      if (i < n) {
        out += src[i];
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Extract every module specifier this file depends on at compile time:
 *   - static `import ... from "<mod>"` (incl. `import type`)
 *   - `export ... from "<mod>"` re-exports (incl. `export type ... from`)
 *   - bare side-effect `import "<mod>"`
 *   - inline `import("<literal>")` type/dynamic expressions
 * Returns the raw specifier strings (comments stripped, string contents kept).
 */
function extractImportSpecifiers(rawSrc: string): string[] {
  const src = stripComments(rawSrc);
  const results: string[] = [];

  // `import ... from "..."` / `export ... from "..."`
  const withFromRe = /^[ \t]*(?:import|export)\s+[\s\S]*?\s+from\s+["']([^"']+)["']/gm;
  // Bare side-effect import: `import "..."`
  const bareRe = /^[ \t]*import\s+["']([^"']+)["']/gm;
  // Inline import("literal") — type position or dynamic.
  const inlineRe = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  let m: RegExpExecArray | null;
  while ((m = withFromRe.exec(src))) results.push(m[1]!);
  while ((m = bareRe.exec(src))) results.push(m[1]!);
  while ((m = inlineRe.exec(src))) results.push(m[1]!);

  return results;
}

const WEB_CORE_WEB = "plugins/framework/plugins/web-core/web";

/**
 * Resolve an import specifier from `fromRel` to a concrete repo-relative file
 * path, or null if it doesn't resolve to a tracked source file (bare npm
 * package, missing target, etc.).
 *
 * Only the two tsconfig aliases exist:
 *   @plugins/<rest> → plugins/<rest>
 *   @/<rest>        → plugins/framework/plugins/web-core/web/<rest>
 * Relative ./ ../ resolve against the importing file's dir.
 * Each candidate base is tried with .ts, .tsx, /index.ts, /index.tsx.
 */
function resolveSpecifier(root: string, fromRel: string, spec: string): string | null {
  let baseRel: string | null = null;
  if (spec.startsWith("./") || spec.startsWith("../")) {
    const abs = resolve(dirname(join(root, fromRel)), spec);
    baseRel = relative(root, abs).split(sep).join("/");
  } else if (spec.startsWith("@plugins/")) {
    baseRel = "plugins/" + spec.slice("@plugins/".length);
  } else if (spec === "@" || spec.startsWith("@/")) {
    const rest = spec === "@" ? "" : spec.slice("@/".length);
    baseRel = rest ? `${WEB_CORE_WEB}/${rest}` : WEB_CORE_WEB;
  } else {
    return null; // bare package or unknown alias
  }

  if (baseRel.startsWith("..")) return null; // escaped repo root

  const candidates = [
    baseRel,
    `${baseRel}.ts`,
    `${baseRel}.tsx`,
    `${baseRel}/index.ts`,
    `${baseRel}/index.tsx`,
  ];
  for (const cand of candidates) {
    if (!(cand.endsWith(".ts") || cand.endsWith(".tsx"))) continue;
    if (existsSync(join(root, cand))) return cand;
  }
  return null;
}

/**
 * Build the REVERSE import adjacency map over every linted .ts/.tsx file:
 * Map<importeeRelPath, Set<importerRelPath>>. An entry `A → {B, C}` means B and
 * C statically import A (directly), so a change to A type-affects B and C.
 */
export function buildReverseImportGraph(root: string): Map<string, Set<string>> {
  const files = findLintFiles(root);
  const reverse = new Map<string, Set<string>>();
  for (const importer of files) {
    const src = safeRead(join(root, importer));
    if (!src) continue;
    for (const spec of extractImportSpecifiers(src)) {
      const importee = resolveSpecifier(root, importer, spec);
      if (!importee || importee === importer) continue;
      let set = reverse.get(importee);
      if (!set) {
        set = new Set<string>();
        reverse.set(importee, set);
      }
      set.add(importer);
    }
  }
  return reverse;
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

  const reverse = buildReverseImportGraph(root);

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

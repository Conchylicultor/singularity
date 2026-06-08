// Import-graph construction over the linted .ts/.tsx file set.
//
// The extractor below is adapted (copied & specialized to file granularity)
// from the private import-extractor in
// plugins/framework/plugins/tooling/plugins/checks/plugins/plugin-boundaries/check/index.ts
// (extractPluginImports / extractRelativeImports / resolveImport / findSourceFiles).
// We must NOT import from that check (it's a private check file), so the logic
// is duplicated here and resolves specifiers to concrete repo-relative files.
//
// This is the single source of truth for the import graph: both the eslint
// check's closure cache and the cli's git affected-set scoping consume it.

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { dirname, join, relative, resolve, sep } from "path";

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

export function isLintable(rel: string): boolean {
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

export function findLintFiles(root: string): string[] {
  const out: string[] = [];
  walkLintFiles(root, root, out);
  return out;
}

export function safeRead(absPath: string): string | null {
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
export function resolveSpecifier(root: string, fromRel: string, spec: string): string | null {
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

export interface ImportGraphs {
  files: string[]; // all lintable rel paths
  forward: Map<string, Set<string>>; // importer -> Set<importee>
  reverse: Map<string, Set<string>>; // importee -> Set<importer>
}

/**
 * Build the forward AND reverse import adjacency maps over every linted
 * .ts/.tsx file in a single walk. For each resolved importer→importee edge,
 * insert into both maps:
 *   - forward: Map<importer, Set<importee>> — what each file imports.
 *   - reverse: Map<importee, Set<importer>> — who imports each file.
 */
export function buildImportGraphs(root: string): ImportGraphs {
  const files = findLintFiles(root);
  const forward = new Map<string, Set<string>>();
  const reverse = new Map<string, Set<string>>();
  for (const importer of files) {
    const src = safeRead(join(root, importer));
    if (!src) continue;
    for (const spec of extractImportSpecifiers(src)) {
      const importee = resolveSpecifier(root, importer, spec);
      if (!importee || importee === importer) continue;
      let fwd = forward.get(importer);
      if (!fwd) {
        fwd = new Set<string>();
        forward.set(importer, fwd);
      }
      fwd.add(importee);
      let rev = reverse.get(importee);
      if (!rev) {
        rev = new Set<string>();
        reverse.set(importee, rev);
      }
      rev.add(importer);
    }
  }
  return { files, forward, reverse };
}

/**
 * Build the REVERSE import adjacency map over every linted .ts/.tsx file:
 * Map<importeeRelPath, Set<importerRelPath>>. An entry `A → {B, C}` means B and
 * C statically import A (directly), so a change to A type-affects B and C.
 *
 * Thin wrapper over buildImportGraphs for callers that only need the reverse
 * map (the cli affected-set scoping).
 */
export function buildReverseImportGraph(root: string): Map<string, Set<string>> {
  return buildImportGraphs(root).reverse;
}

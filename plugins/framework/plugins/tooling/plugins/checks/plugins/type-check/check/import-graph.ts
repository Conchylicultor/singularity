// Import-graph construction over the linted .ts/.tsx file set.
//
// The extractor below is adapted (copied & specialized to file granularity)
// from the private import-extractor in
// plugins/framework/plugins/tooling/plugins/checks/plugins/plugin-boundaries/check/index.ts
// (extractPluginImports / extractRelativeImports / resolveImport / findSourceFiles).
// We must NOT import from that check (it's a private check file), so the logic
// is duplicated here and resolves specifiers to concrete repo-relative files.
//
// This module does NOT enumerate. Its candidate file set arrives pre-enumerated
// from `listRepoFiles` (checks/core) — the ONE git-backed lister the whole check
// run shares — so the graph covers exactly the tree the check cache key hashes,
// and a gitignored file can no longer reach type-check's coverage gate. That is
// what a filesystem walk with a private deny-list could not promise; see
// research/2026-09-09-tooling-check-file-enumeration-from-git.md.

import { existsSync, readFileSync, statSync } from "fs";
import { dirname, join, relative, resolve, sep } from "path";
import {
  findImports,
  maskSource,
} from "@plugins/plugin-meta/plugins/parse-utils/core";

// What remains of eslint's ignore list (`lint/core/build-lint-config.ts`) once
// git has done its part. `.gitignore` already withholds node_modules, dist (and
// dist.staging/live/old.*), .check-*, .claude/worktrees and web-core/dist, so a
// git-enumerated set never contains them and this predicate must not restate
// them. These two are tracked, so git DOES list them: generated sources, and
// `prototypes/` — standalone CDN-React mocks belonging to no tsconfig.
function isIgnoredRelPath(rel: string): boolean {
  if (rel.endsWith(".generated.ts")) return true;
  if (rel.startsWith("prototypes/")) return true;
  return false;
}

export function isLintable(rel: string): boolean {
  if (!(rel.endsWith(".ts") || rel.endsWith(".tsx"))) return false;
  return !isIgnoredRelPath(rel);
}

export function safeRead(absPath: string): string | null {
  try {
    if (!statSync(absPath).isFile()) return null;
    return readFileSync(absPath, "utf-8");
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code !== "ENOENT" &&
      (err as NodeJS.ErrnoException).code !== "EACCES" &&
      (err as NodeJS.ErrnoException).code !== "ENOTDIR"
    )
      throw err;
    return null;
  }
}

/**
 * Extract every module specifier this file depends on at compile time:
 *   - static `import ... from "<mod>"` (incl. `import type`)
 *   - `export ... from "<mod>"` re-exports (incl. `export type ... from`)
 *   - bare side-effect `import "<mod>"`
 *   - inline `import("<literal>")` type/dynamic expressions
 * Returns the raw specifier strings.
 *
 * The static forms route through `findImports` (the shared static-import
 * scanner), which masks comments/regex/strings fully and reads each specifier
 * back by offset — so an import written inside a string or template literal (a
 * test fixture, a docs snippet, a codegen template) is never mistaken for a real
 * edge. This is a compile-time import GRAPH, so we keep ALL of them: type-only
 * imports (`import type …` / `export type … from`) are real compile edges, and
 * bare side-effect imports too.
 */
function extractImportSpecifiers(rawSrc: string): string[] {
  const results: string[] = [];

  // Static `import … from "…"` / `export … from "…"` / bare `import "…"`.
  for (const imp of findImports(rawSrc)) results.push(imp.specifier);

  // Inline `import("literal")` — type-position or dynamic. `findImports` treats
  // it as a call, not a static import, so it is out of scope there; scan for it
  // here over MASKED source and read the specifier back by offset, so an
  // `import("…")` inside a string/template literal is never mistaken for a real
  // one.
  const masked = maskSource(rawSrc);
  const re = /\bimport\s*\(\s*(["'`])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    const openQuoteIdx = m.index + m[0].length - 1;
    const quote = masked[openQuoteIdx]!;
    const closeIdx = masked.indexOf(quote, openQuoteIdx + 1);
    if (closeIdx < 0) continue;
    results.push(rawSrc.slice(openQuoteIdx + 1, closeIdx));
  }

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
export function resolveSpecifier(
  root: string,
  fromRel: string,
  spec: string,
): string | null {
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
 * .ts/.tsx file in a single pass. For each resolved importer→importee edge,
 * insert into both maps:
 *   - forward: Map<importer, Set<importee>> — what each file imports.
 *   - reverse: Map<importee, Set<importer>> — who imports each file.
 *
 * `allFiles` is the run's one git-derived enumeration (`listRepoFiles`); the
 * lintable set is a filter over it, never a second walk. Reading each file's
 * bytes to extract its edges is unrelated to enumeration, so this stays
 * synchronous.
 */
export function buildImportGraphs(
  root: string,
  allFiles: string[],
): ImportGraphs {
  const files = allFiles.filter(isLintable);
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

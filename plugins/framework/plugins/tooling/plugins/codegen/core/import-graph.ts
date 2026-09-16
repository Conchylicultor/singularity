import { dirname, isAbsolute, relative, resolve } from "path";
import type { RepoFiles } from "@plugins/framework/plugins/tooling/core";
import { findImports } from "@plugins/plugin-meta/plugins/parse-utils/core";
import { readListed, timeSlicer } from "./scan-pacing";

/**
 * Static module-import-graph helpers for the `pre-barrel-manifests-complete`
 * check. Import scanning routes through `findImports` (the shared static-import
 * scanner), which masks comments/regex/strings and reads each specifier back by
 * offset — so an import written inside a string/template literal is never
 * mistaken for a real one. Resolution asks the repo's file set, never the disk:
 * a stat per candidate extension per import, over every file a barrel reaches,
 * was tens of thousands of blocking calls on a check pass's shared thread.
 */

// Asset specifiers that never resolve to a .generated.ts module.
const ASSET_RE = /\.(css|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf)$/i;

// The repo's single internal path alias: `@plugins/…` maps to `<root>/plugins/…`.
const PLUGINS_ALIAS = "@plugins/";

/**
 * An import specifier we follow when walking the module-load graph: a relative
 * (`./` / `../`) path or a same-repo `@plugins/…` alias path. Cross-package and
 * bare npm specifiers are not internal.
 */
function isInternal(spec: string): boolean {
  return (
    spec.startsWith("./") ||
    spec.startsWith("../") ||
    spec.startsWith(PLUGINS_ALIAS)
  );
}

function isAsset(spec: string): boolean {
  return ASSET_RE.test(spec);
}

/**
 * From masked source, return the internal specifiers (relative or `@plugins/…`)
 * of RUNTIME (non-type-only) `import` / `export … from` statements, plus bare
 * side-effect imports. Excludes whole-statement `import type` / `export type`
 * forms, bare npm / workspace specifiers, and asset specifiers (.css/.svg/...).
 *
 * Both kinds matter for reachability: a barrel can reach a `.generated.ts`
 * either through a relative path or — within its own plugin — through the
 * `@plugins/…` alias (e.g. ui-kit's `cn` imports the custom-utilities registry
 * by alias).
 *
 * Slightly over-inclusive by design: a `import { type X } from "./y"` (runtime
 * keyword, type-only binding) is treated as runtime. That's safe — pre-barrel
 * regeneration is always sound — and we only drop the unambiguous
 * whole-statement type forms (which `findImports` flags via `typeOnly`).
 *
 * `src` is RAW source; `findImports` masks internally.
 */
export function extractRuntimeImportSpecifiers(src: string): string[] {
  const out: string[] = [];
  for (const imp of findImports(src)) {
    if (imp.typeOnly) continue;
    if (!isInternal(imp.specifier) || isAsset(imp.specifier)) continue;
    out.push(imp.specifier);
  }
  return out;
}

/** What resolution needs of a file set: its root, and membership. */
export type FileMembership = Pick<RepoFiles, "root" | "has">;

function resolveModuleFile(files: FileMembership, base: string): string | null {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    resolve(base, "index.ts"),
  ];
  for (const c of candidates) {
    const rel = relative(files.root, c);
    // Outside the root (or the root itself) is in no file set — and is not a
    // path a file set accepts: `has` throws on a malformed one.
    if (rel === "" || rel === ".." || rel.startsWith("../") || isAbsolute(rel))
      continue;
    if (files.has(rel)) return c;
  }
  return null;
}

/**
 * Resolve an internal import specifier to an absolute file path. Relative specs
 * resolve against the importing file's directory; `@plugins/…` specs resolve
 * against `<root>/plugins/…`. Tries `<spec>` (only if it's a file, e.g. an
 * explicit `.ts`/`.tsx`), `<spec>.ts`, `<spec>.tsx`, then `<spec>/index.ts`.
 * Returns the first one in the file set, as an absolute path, or null. A bare
 * specifier that names a directory resolves to its `index.ts`, never to the
 * directory — a file set lists no directories.
 */
export function resolveImportSpecifier(
  files: FileMembership,
  fromFile: string,
  spec: string,
): string | null {
  if (spec.startsWith(PLUGINS_ALIAS)) {
    const rel = spec.slice(PLUGINS_ALIAS.length);
    return resolveModuleFile(files, resolve(files.root, "plugins", rel));
  }
  return resolveModuleFile(files, resolve(dirname(fromFile), spec));
}

/**
 * The internal runtime-import graph reachable from `roots` (absolute paths of
 * files in `repo`): every reached file → the absolute paths its internal
 * runtime imports resolve to. Each reached file is read once, asynchronously,
 * one import level at a time, and the parse loop yields as it goes — so a
 * caller asking two questions of one reach (web barrels only, then every
 * barrel) reads nothing twice.
 */
export async function collectImportGraph(
  repo: RepoFiles,
  roots: readonly string[],
): Promise<Map<string, readonly string[]>> {
  const edges = new Map<string, readonly string[]>();
  const seen = new Set<string>();
  const tick = timeSlicer();
  let level: string[] = [];
  for (const root of roots) {
    const abs = resolve(root);
    if (seen.has(abs)) continue;
    seen.add(abs);
    level.push(abs);
  }
  while (level.length > 0) {
    const texts = await Promise.all(
      level.map((abs) => readListed(repo, relative(repo.root, abs))),
    );
    const next: string[] = [];
    for (const [i, abs] of level.entries()) {
      const targets: string[] = [];
      for (const spec of extractRuntimeImportSpecifiers(texts[i]!)) {
        const target = resolveImportSpecifier(repo, abs, spec);
        if (target === null) continue;
        targets.push(target);
        if (seen.has(target)) continue;
        seen.add(target);
        next.push(target);
      }
      edges.set(abs, targets);
      await tick();
    }
    level = next;
  }
  return edges;
}

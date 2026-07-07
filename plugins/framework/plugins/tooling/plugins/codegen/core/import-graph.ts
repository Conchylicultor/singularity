import { existsSync, statSync } from "fs";
import { dirname, resolve } from "path";
import { findImports } from "@plugins/plugin-meta/plugins/parse-utils/core";

/**
 * Static module-import-graph helpers for the `pre-barrel-manifests-complete`
 * check. Import scanning routes through `findImports` (the shared static-import
 * scanner), which masks comments/regex/strings and reads each specifier back by
 * offset — so an import written inside a string/template literal is never
 * mistaken for a real one.
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

function isFile(p: string): boolean {
  return existsSync(p) && statSync(p).isFile();
}

function resolveModuleFile(base: string): string | null {
  const candidates = [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")];
  for (const c of candidates) {
    if (isFile(c)) return c;
  }
  return null;
}

/**
 * Resolve an internal import specifier to an absolute file path. Relative specs
 * resolve against the importing file's directory; `@plugins/…` specs resolve
 * against `<root>/plugins/…`. Tries `<spec>` (only if it's a file, e.g. an
 * explicit `.ts`/`.tsx`), `<spec>.ts`, `<spec>.tsx`, then `<spec>/index.ts`.
 * Returns the first existing file's absolute path, or null. A bare specifier
 * that names a directory resolves to its `index.ts`, never to the directory.
 */
export function resolveImportSpecifier(
  root: string,
  fromFile: string,
  spec: string,
): string | null {
  if (spec.startsWith(PLUGINS_ALIAS)) {
    const rel = spec.slice(PLUGINS_ALIAS.length);
    return resolveModuleFile(resolve(root, "plugins", rel));
  }
  return resolveModuleFile(resolve(dirname(fromFile), spec));
}

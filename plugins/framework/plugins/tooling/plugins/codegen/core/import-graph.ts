import { existsSync, statSync } from "fs";
import { dirname, resolve } from "path";

/**
 * Static module-import-graph helpers for the `pre-barrel-manifests-complete`
 * check. Both operate on raw text (no TS AST, like every other build-time
 * scanner in the repo) — the caller masks comments/regex with
 * `maskSource(src, { strings: false })` first so import-path string literals
 * survive, then feeds the masked source here.
 */

// `import … from "<spec>"` and `export … from "<spec>"`, capturing the bindings
// span (so we can drop `import type` / `export type`) and the specifier.
// Side-effect imports (`import "<spec>"`) have no `from` and are matched
// separately below.
const FROM_RE =
  /\b(?:import|export)\b([^"'`;]*?)\bfrom\s*["'`]([^"'`]+)["'`]/g;
// Bare side-effect import: `import "<spec>"` (no bindings, no `from`).
const SIDE_EFFECT_RE = /\bimport\s*["'`]([^"'`]+)["'`]/g;

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
 * whole-statement type forms.
 */
export function extractRuntimeImportSpecifiers(maskedSrc: string): string[] {
  const out: string[] = [];

  FROM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FROM_RE.exec(maskedSrc))) {
    const bindings = m[1]!;
    const spec = m[2]!;
    // Whole-statement type form: `import type …` / `export type …`.
    if (/^\s*type\b/.test(bindings)) continue;
    if (!isInternal(spec) || isAsset(spec)) continue;
    out.push(spec);
  }

  SIDE_EFFECT_RE.lastIndex = 0;
  while ((m = SIDE_EFFECT_RE.exec(maskedSrc))) {
    const spec = m[1]!;
    if (!isInternal(spec) || isAsset(spec)) continue;
    out.push(spec);
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

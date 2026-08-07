// The repo's byte-format AUTHORITY: what may be formatted (the allowlist),
// with which options (the hardcoded object below), and which files must always
// be formatted together (the coupled sets). Everything that writes or asserts
// formatted bytes — `./singularity build`, `./singularity format`, and the
// `format-clean` check — goes through this one module, so the writer and the
// readers cannot produce different bytes.

import { extname } from "path";

/**
 * The allowlist. Nothing is formatted by default; a file type opts in HERE and
 * nowhere else.
 *
 * **Markdown must never be added** — prose reflows are review noise with no
 * mechanical benefit, and the docgen emitters would fight it. JSON/JSONC is
 * deliberately deferred.
 *
 * The allowlist is unbypassable by construction: `formatSource` takes a file
 * path, has no `parser` parameter, and no content-only entry point exists — so
 * a caller cannot format a `.md` by asking nicely.
 */
export const FORMATTABLE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"] as const;

/**
 * Whether GENERATED artifacts (`*.generated.ts`) are formatted.
 *
 * Deliberately `false`, and deliberately ONE constant. Two writers reach
 * generated files — codegen's `formatGenerated` (which emits them) and the
 * changed-set format pass (which sees them as ordinary changed `.ts`) — and they
 * must agree. When they disagreed the result was a deterministic ping-pong:
 * codegen wrote the file unformatted, the build's format pass (which runs after
 * all codegen) reformatted it, so no build was ever idempotent and every
 * `*-in-sync` check over a generated file went red, since disk was formatted and
 * `formatGenerated(renderX(...))` was not.
 *
 * Flipping it is its own commit, on purpose. At prettier's default width
 * `web.generated.ts` goes from 783 to 10,150 lines (see the open decision in
 * `research/2026-08-06-global-prettier-auto-format.md`), so the flip is a
 * deliberate, isolated, revertible change — this one line, plus the reformatted
 * artifacts committed alongside it.
 */
const FORMAT_GENERATED_ARTIFACTS: boolean = false;

/** Every generated `.ts` artifact in the repo is named this way (18 today). */
const GENERATED_SUFFIX = ".generated.ts";

/**
 * Whether `file`'s bytes may be formatted at all: its extension is in
 * {@link FORMATTABLE_EXTENSIONS}, and it is not a generated artifact being held
 * out by {@link FORMAT_GENERATED_ARTIFACTS}.
 *
 * Both consumers read this one predicate — `formatSource` (and therefore
 * codegen's `formatGenerated`) and the changed-set filter — so a generated file
 * cannot be formatted by one and not the other.
 */
export function isFormattable(file: string): boolean {
  const ext = extname(file).toLowerCase();
  if (!(FORMATTABLE_EXTENSIONS as readonly string[]).includes(ext))
    return false;
  if (!FORMAT_GENERATED_ARTIFACTS && file.endsWith(GENERATED_SUFFIX)) {
    return false;
  }
  return true;
}

/**
 * Files that must be formatted as a SET: touching one drags in all of them.
 *
 * The one member today is the six `no-adhoc-*` class lint rules, which
 * `class-token-walk-in-sync` asserts carry a BYTE-IDENTICAL copy of the shared
 * class-token walk (it can't be imported — lint rules dual-load under jiti,
 * which can't resolve `@plugins/*`). All six are currently non-conformant with
 * prettier, so a branch that touches one would format only that one and break
 * the byte-identity the check exists to defend.
 *
 * Keep in sync with the `EXPECTED` list in
 * `plugins/framework/plugins/tooling/plugins/checks/plugins/class-token-walk-in-sync/check/index.ts`
 * — that check is the authority on membership and fails loudly when the sets
 * disagree.
 */
export const COUPLED_FORMAT_SETS: readonly (readonly string[])[] = [
  [
    "plugins/primitives/plugins/css/plugins/text/lint/no-adhoc-typography.ts",
    "plugins/primitives/plugins/css/plugins/radius/lint/no-adhoc-radius.ts",
    "plugins/primitives/plugins/css/plugins/z-layers/lint/no-adhoc-zindex.ts",
    "plugins/primitives/plugins/css/plugins/control-size/lint/no-adhoc-control.ts",
    "plugins/primitives/plugins/css/plugins/control-size/lint/no-adhoc-density.ts",
    "plugins/primitives/plugins/css/plugins/icon-auto/lint/no-adhoc-slot-icon-size.ts",
  ],
];

/**
 * The formatting options, HARDCODED rather than resolved.
 *
 * `prettier.resolveConfig()` is deliberately never called and `.prettierignore`
 * is deliberately not honored: the build (writer) and the in-sync checks
 * (readers) must emit byte-identical output, and a per-file config walk is a
 * way for them to diverge. The root `.prettierrc` exists only so editors agree
 * with this object.
 *
 * Every value is prettier's own default, spelled out so a prettier upgrade that
 * changes a default cannot silently reformat the repo. Measured line-length p90
 * across the repo is 80, so `printWidth: 80` is also the smallest possible
 * migration diff.
 */
const PRETTIER_OPTIONS = {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: false,
  quoteProps: "as-needed",
  jsxSingleQuote: false,
  trailingComma: "all",
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: "always",
  endOfLine: "lf",
  singleAttributePerLine: false,
} as const;

/**
 * Memoized DYNAMIC import of prettier.
 *
 * Dynamic is load-bearing, not style. A static `import "prettier"` hoists above
 * every statement in the module graph, so a static import reachable from the
 * CLI would resolve out of the very `node_modules` that `ensureDeps()` exists
 * to repair — the same hazard `cli:bootstrap-package-free` enforces against on
 * `bin/index.ts`. Lazy also means a build whose changed set has no `.ts` pays
 * nothing.
 */
let mod: Promise<typeof import("prettier")> | null = null;
function prettier(): Promise<typeof import("prettier")> {
  return (mod ??= import("prettier"));
}

/**
 * Format `source` as if it lived at `file`. Pure — never reads, never writes.
 *
 * Returns `source` UNCHANGED (without even loading prettier) when the extension
 * is not in {@link FORMATTABLE_EXTENSIONS}, so a caller cannot format a `.md`
 * by calling it anyway.
 *
 * A prettier failure (syntax error) THROWS, re-stamped with the path so the
 * `line:col` prettier reports is attributable. Never swallow it: a silently
 * skipped file lands unformatted and `format-clean` then fails at push with no
 * explanation.
 */
export async function formatSource(
  file: string,
  source: string,
): Promise<string> {
  if (!isFormattable(file)) return source;
  const { format } = await prettier();
  try {
    // `parser` is pinned; `filepath` is what enables JSX for `.tsx`.
    return await format(source, {
      ...PRETTIER_OPTIONS,
      filepath: file,
      parser: "typescript",
    });
  } catch (err) {
    throw new Error(
      `prettier failed to format ${file}: ${(err as Error).message}`,
      {
        cause: err,
      },
    );
  }
}

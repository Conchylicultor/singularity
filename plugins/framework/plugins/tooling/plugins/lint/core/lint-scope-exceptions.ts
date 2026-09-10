// The files ESLint deliberately skips that are NOT build output.
//
// Two different things used to sit in one `ignores` array and get maintained as
// if they were the same kind of thing:
//
//   1. Gitignored directories (`node_modules`, `dist`, `.check-*`, …). These
//      are build output, and `.gitignore` is their authority — nothing here
//      should restate it. They stayed behind in `build-lint-config.ts`, demoted
//      to what they actually are: a convenience for the editor.
//   2. TRACKED, COMMITTED files that ESLint skips on purpose. Those are these
//      two, and they are real lint-scope policy that no other source states.
//
// Keeping them together meant the two lists drifted. The type-check check's own
// file walk excluded `*.generated.ts` but NOT `prototypes/**`, so a `.ts` under
// `prototypes/` would have failed the coverage gate ("belongs to no tsconfig
// program") while ESLint quietly ignored it. Latent only because no such file
// exists yet.
//
// Imported RELATIVELY by `build-lint-config.ts` — load-bearing: that file is
// dual-loaded, by jiti for the root `eslint.config.ts` (which cannot resolve the
// `@plugins/*` alias) and by Bun for the type-check worker. Consumers outside
// this plugin take it from the `lint/core` barrel.

/**
 * ESLint `ignores` globs for tracked files that are deliberately out of lint
 * scope. NOT for build output — that is `.gitignore`'s job.
 */
export const LINT_SCOPE_EXCLUDE_GLOBS = [
  // Codegen output. Committed and reviewable, but not hand-written, so lint
  // findings in it are addressed at the generator.
  "**/*.generated.ts",
  // Repo-root prototype mocks: standalone CDN-React/Babel-in-browser files that
  // belong to no tsconfig and no plugin tree.
  "prototypes/**",
] as const;

/**
 * The same rule as `LINT_SCOPE_EXCLUDE_GLOBS`, as a predicate over a
 * repo-relative path — the form a file-list consumer needs, since ESLint's flat
 * config takes globs and a walk takes a function.
 *
 * The two spellings are bound by `lint-scope-exceptions.test.ts`, which checks
 * this predicate against a real glob matcher over the list above.
 */
export function isLintScopeExcluded(rel: string): boolean {
  if (rel.endsWith(".generated.ts")) return true;
  if (rel.startsWith("prototypes/")) return true;
  return false;
}

// Binds the two spellings of the same lint-scope policy.
//
// ESLint's flat config takes GLOBS; a file-list consumer (type-check's lintable
// set) takes a PREDICATE. Neither form can be derived from the other at the
// point of use, so both exist — and this suite is what stops them drifting, the
// way they drifted before (`prototypes/**` was in the ESLint list and in neither
// walk, so a `.ts` there would have failed the coverage gate while ESLint
// ignored it).
//
// The globs are matched with `Bun.Glob` — an INDEPENDENT matcher, deliberately
// not the predicate's own logic, so the assertion is a real cross-check rather
// than a restatement.

import { describe, expect, it } from "bun:test";
import {
  LINT_SCOPE_EXCLUDE_GLOBS,
  isLintScopeExcluded,
} from "./lint-scope-exceptions";

function matchesAnyGlob(rel: string): boolean {
  return LINT_SCOPE_EXCLUDE_GLOBS.some((g) => new Bun.Glob(g).match(rel));
}

/**
 * Paths the two forms must agree on. Real shapes from this repo, plus the near
 * misses that a sloppy `includes()` implementation would get wrong.
 */
const BATTERY = [
  // Excluded: codegen output, at every depth.
  "plugins/framework/plugins/tooling/plugins/lint/core/lint.generated.ts",
  "plugins/framework/plugins/web-sdk/core/web.generated.ts",
  "plugins/framework/plugins/web-sdk/core/web.composition.sonata.generated.ts",
  "web.generated.ts",
  // Excluded: prototype mocks, at every depth.
  "prototypes/_template/app.ts",
  "prototypes/some-mock/nested/deep/thing.tsx",
  // Kept: ordinary source.
  "plugins/tasks/web/index.ts",
  "plugins/framework/plugins/tooling/plugins/checks/core/repo-files.ts",
  "eslint.config.ts",
  // Kept: near misses. A name that merely CONTAINS the marker, a `.generated`
  // that is not a `.ts`, and a directory that only starts with the same letters.
  "plugins/tasks/core/generated.ts.bak",
  "plugins/tasks/core/thing.generated.tsx",
  "plugins/tasks/core/generated-helpers.ts",
  "prototypes-archive/thing.ts",
  "docs/prototypes/notes.ts",
];

describe("lint scope exceptions", () => {
  it("the predicate agrees with the globs on every path", () => {
    for (const rel of BATTERY) {
      expect({ rel, excluded: isLintScopeExcluded(rel) }).toEqual({
        rel,
        excluded: matchesAnyGlob(rel),
      });
    }
  });

  it("excludes generated output and prototypes", () => {
    expect(isLintScopeExcluded("plugins/tasks/core/x.generated.ts")).toBe(true);
    expect(isLintScopeExcluded("prototypes/x/app.ts")).toBe(true);
  });

  it("keeps ordinary source, including near misses", () => {
    expect(isLintScopeExcluded("plugins/tasks/web/index.ts")).toBe(false);
    expect(isLintScopeExcluded("plugins/tasks/core/generated-helpers.ts")).toBe(
      false,
    );
    expect(isLintScopeExcluded("prototypes-archive/thing.ts")).toBe(false);
  });

  it("is about tracked files only — it must not restate .gitignore", () => {
    // Build output is `.gitignore`'s job and `listRepoFiles`' concern. If one of
    // these ever starts returning true, the two responsibilities have been
    // merged back together.
    expect(isLintScopeExcluded("node_modules/left-pad/index.ts")).toBe(false);
    expect(isLintScopeExcluded(".cache/tsbuildinfo/scratch.ts")).toBe(false);
    expect(isLintScopeExcluded(".claude/worktrees/wt/plugins/a/x.ts")).toBe(
      false,
    );
  });
});

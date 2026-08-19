/**
 * The canonical bun:test ⇄ vitest split, as data.
 *
 * The repo has two test runners and the runner is chosen by WHERE the file
 * lives. That is only true if the two scopes are exact complements:
 *
 *   - vitest  owns `plugins/**\/web/__tests__/**\/*.test.{ts,tsx}` (its `include`)
 *   - bun:test owns everything else — expressed as the ignore `**\/web/__tests__/**`
 *
 * Those two literals live in two config files (`vitest.config.ts`,
 * `bunfig.toml`) that know nothing about each other. This module is the one
 * place they are written down together, so the CLI that dispatches to both
 * runners and the check that enforces the pair read the SAME strings — a drift
 * between the configs and the tooling is then impossible by construction.
 *
 * WHY the bun ignore is `**\/web/__tests__/**` and not the looser
 * `**\/__tests__/**`: it must be the EXACT complement of vitest's include. Under
 * the looser glob a stray `core/__tests__/foo.test.ts` would be ignored by
 * bun:test AND unmatched by vitest's `plugins/**\/web/__tests__/` include — in
 * neither runner's scope, silently never run. That is the quiet version of the
 * cross-load bug this split exists to fix. With the exact pair such a file stays
 * in bun:test's scope (loud) until `test-layout:runner-split` rule (c) rejects
 * it outright.
 */

/** Verbatim `include` from `vitest.config.ts`. Asserted by the check. */
export const DOM_TEST_INCLUDE = "plugins/**/web/__tests__/**/*.test.{ts,tsx}";

/** Verbatim `[test] pathIgnorePatterns` entry from `bunfig.toml`. Asserted by the check. */
export const BUN_TEST_IGNORE = "**/web/__tests__/**";

/**
 * The shared vitest setup file, repo-relative — the one module every jsdom suite
 * evaluates before its own. It is where the clock is pinned. Asserted by the
 * check.
 */
export const DOM_TEST_SETUP_FILE = "test/setup.ts";

/**
 * Verbatim pin call from {@link DOM_TEST_SETUP_FILE}. Asserted by the check.
 *
 * A jsdom test must not be able to depend on what day it runs on, and the pin is
 * one small block in a file otherwise full of DOM stubs — exactly the kind of
 * line that gets deleted while chasing an unrelated failure, with the cost
 * arriving weeks later as a suite that turns red on a date nobody changed. This
 * literal is what rule (f) looks for.
 */
export const DOM_TEST_CLOCK_PIN = "vi.setSystemTime(TEST_NOW)";

/** Every test file, either runner. The enumeration glob used to build a bucket list. */
export const TEST_FILE_GLOB = "**/*.test.{ts,tsx}";

/** Strip a leading `./` and normalise separators, so callers may pass either form. */
function normalize(repoRelPath: string): string {
  return repoRelPath.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Is this a test file at all — i.e. does `TEST_FILE_GLOB` match it? */
export function isTestFilePath(repoRelPath: string): boolean {
  const p = normalize(repoRelPath);
  return p.endsWith(".test.ts") || p.endsWith(".test.tsx");
}

/**
 * Does vitest's `include` cover this path — i.e. is it a jsdom/React test?
 *
 * `repoRelPath` is repo-relative POSIX (a leading `./` is tolerated). This is
 * the ONE predicate; everything else in the split is derived from it.
 */
export function isDomTestPath(repoRelPath: string): boolean {
  const p = normalize(repoRelPath);
  // `plugins/**/web/__tests__/**/*.test.{ts,tsx}`: the `**` may match zero
  // segments, so `plugins/web/__tests__/x.test.ts` counts too — hence the
  // `plugins/` prefix test plus a `web/__tests__/` segment anywhere after it.
  if (!isTestFilePath(p)) return false;
  if (!p.startsWith("plugins/")) return false;
  return p.includes("/web/__tests__/");
}

/**
 * Does `bun test` run this path — i.e. is it a test file that
 * `BUN_TEST_IGNORE` does NOT exclude?
 *
 * Deliberately not `!isDomTestPath(...)`: the bun ignore is unanchored
 * (`**\/web/__tests__/**`) while the vitest include is anchored at `plugins/`,
 * so a file such as `cli/web/__tests__/a.test.ts` is excluded by BOTH. Deriving
 * one predicate from the other by negation would claim bun:test runs it and the
 * file would silently never execute.
 */
export function isBunTestPath(repoRelPath: string): boolean {
  const p = normalize(repoRelPath);
  if (!isTestFilePath(p)) return false;
  return !p.includes("/web/__tests__/") && !p.startsWith("web/__tests__/");
}

/**
 * Bucket test paths by the runner that actually runs them.
 *
 * `orphan` holds paths NEITHER runner's scope covers. It exists so the
 * partition can never silently swallow a file: dropping such a path from both
 * buckets, or folding it into `bun`, would report a green run for tests that
 * never executed. A passing `test-layout:runner-split` guarantees `orphan` is
 * empty, so consumers may treat a non-empty `orphan` as a hard error.
 */
export function partitionTestPaths(files: readonly string[]): {
  bun: string[];
  dom: string[];
  orphan: string[];
} {
  const bun: string[] = [];
  const dom: string[] = [];
  const orphan: string[] = [];
  for (const file of files) {
    if (isDomTestPath(file)) dom.push(file);
    else if (isBunTestPath(file)) bun.push(file);
    else orphan.push(file);
  }
  return { bun, dom, orphan };
}

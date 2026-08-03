/**
 * Classifier tests for the runner split. Co-located `*.test.ts` importing
 * `bun:test` — this file dogfoods the very rule the sibling check enforces (a
 * pure-logic test lives next to its source and never under a `__tests__/` dir).
 */

import { describe, expect, test } from "bun:test";
import {
  BUN_TEST_IGNORE,
  DOM_TEST_INCLUDE,
  isBunTestPath,
  isDomTestPath,
  isTestFilePath,
  partitionTestPaths,
} from "./test-layout";

describe("isDomTestPath", () => {
  test("co-located pure-logic tests are NOT dom tests", () => {
    expect(isDomTestPath("plugins/page/plugins/editor/core/block-ops.test.ts")).toBe(false);
    expect(isDomTestPath("plugins/primitives/plugins/pane/web/internal/route.test.ts")).toBe(false);
    expect(isDomTestPath("cli/commands/build.test.ts")).toBe(false);
  });

  test("web/__tests__ paths under plugins ARE dom tests", () => {
    expect(isDomTestPath("plugins/primitives/plugins/pane/web/__tests__/pane.test.tsx")).toBe(true);
    expect(isDomTestPath("plugins/a/plugins/b/web/__tests__/deep/nested/x.test.ts")).toBe(true);
    // `plugins/**/web/…` — the `**` may match zero segments.
    expect(isDomTestPath("plugins/web/__tests__/x.test.ts")).toBe(true);
  });

  test(".tsx and .ts are both test extensions; other extensions are not", () => {
    expect(isDomTestPath("plugins/a/web/__tests__/x.test.tsx")).toBe(true);
    expect(isDomTestPath("plugins/a/web/__tests__/x.test.ts")).toBe(true);
    expect(isDomTestPath("plugins/a/web/__tests__/helpers.ts")).toBe(false);
    expect(isDomTestPath("plugins/a/web/__tests__/fixture.test.json")).toBe(false);
    expect(isTestFilePath("plugins/a/core/x.test.tsx")).toBe(true);
    expect(isTestFilePath("plugins/a/core/x.ts")).toBe(false);
  });

  test("a leading ./ is tolerated on either kind of path", () => {
    expect(isDomTestPath("./plugins/a/web/__tests__/x.test.tsx")).toBe(true);
    expect(isDomTestPath("./plugins/a/core/x.test.ts")).toBe(false);
    expect(isBunTestPath("./plugins/a/core/x.test.ts")).toBe(true);
  });

  test("a __tests__ dir that is not web/__tests__ is not a dom test", () => {
    // The stray-suite case: ignored by neither scope's intent, caught by the check.
    expect(isDomTestPath("plugins/a/core/__tests__/foo.test.ts")).toBe(false);
    expect(isDomTestPath("plugins/a/server/__tests__/foo.test.ts")).toBe(false);
  });

  test("web/__tests__ OUTSIDE plugins/ is not a dom test (vitest's include is anchored)", () => {
    expect(isDomTestPath("cli/web/__tests__/x.test.ts")).toBe(false);
  });
});

describe("isBunTestPath", () => {
  test("runs every test file the bun ignore does not exclude", () => {
    expect(isBunTestPath("plugins/a/core/x.test.ts")).toBe(true);
    expect(isBunTestPath("plugins/a/core/__tests__/foo.test.ts")).toBe(true);
    expect(isBunTestPath("cli/commands/build.test.ts")).toBe(true);
  });

  test("excludes anything under a web/__tests__ dir, wherever it lives", () => {
    expect(isBunTestPath("plugins/a/web/__tests__/x.test.tsx")).toBe(false);
    // Unanchored ignore: excluded by bun even though vitest's include misses it.
    expect(isBunTestPath("cli/web/__tests__/x.test.ts")).toBe(false);
    expect(isBunTestPath("web/__tests__/x.test.ts")).toBe(false);
  });

  test("is NOT the plain negation of isDomTestPath", () => {
    const orphan = "cli/web/__tests__/x.test.ts";
    expect(isDomTestPath(orphan)).toBe(false);
    expect(isBunTestPath(orphan)).toBe(false);
  });
});

describe("partitionTestPaths", () => {
  test("buckets each path by the runner that actually runs it", () => {
    const { bun, dom, orphan } = partitionTestPaths([
      "plugins/a/core/x.test.ts",
      "plugins/a/web/__tests__/y.test.tsx",
      "./plugins/b/shared/z.test.ts",
      "plugins/b/core/__tests__/stray.test.ts",
    ]);
    expect(dom).toEqual(["plugins/a/web/__tests__/y.test.tsx"]);
    expect(bun).toEqual([
      "plugins/a/core/x.test.ts",
      "./plugins/b/shared/z.test.ts",
      "plugins/b/core/__tests__/stray.test.ts",
    ]);
    expect(orphan).toEqual([]);
  });

  test("a path in neither scope lands in orphan, never silently in bun", () => {
    const { bun, dom, orphan } = partitionTestPaths(["cli/web/__tests__/x.test.ts"]);
    expect(bun).toEqual([]);
    expect(dom).toEqual([]);
    expect(orphan).toEqual(["cli/web/__tests__/x.test.ts"]);
  });

  test("non-test files are never claimed by either runner", () => {
    const { bun, dom, orphan } = partitionTestPaths(["plugins/a/core/index.ts"]);
    expect(bun).toEqual([]);
    expect(dom).toEqual([]);
    expect(orphan).toEqual(["plugins/a/core/index.ts"]);
  });

  test("returns empty buckets for empty input", () => {
    expect(partitionTestPaths([])).toEqual({ bun: [], dom: [], orphan: [] });
  });
});

describe("the scope literals", () => {
  test("the bun ignore is the complement of the vitest include", () => {
    // Both halves describe the same directory shape; the ignore is unanchored
    // and the include is anchored at `plugins/`. Rule (c) of the check closes
    // the gap that difference opens.
    expect(DOM_TEST_INCLUDE).toContain("web/__tests__/");
    expect(BUN_TEST_IGNORE).toContain("web/__tests__/");
    expect(DOM_TEST_INCLUDE.startsWith("plugins/")).toBe(true);
    expect(BUN_TEST_IGNORE.startsWith("**/")).toBe(true);
  });
});

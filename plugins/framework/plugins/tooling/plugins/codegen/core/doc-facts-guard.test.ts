import { describe, expect, test } from "bun:test";
import { assertNoTestCodeInFacts, testCodeInFacts } from "./doc-facts-guard";

const fact = (...values: string[]) => ({ folder: "server", key: "K", values });

describe("testCodeInFacts", () => {
  test("flags paths and specifiers that name test code", () => {
    expect(
      testCodeInFacts([
        fact(
          "`plugins/tasks/plugins/tasks-core/server/testing/install-schema.ts`",
          "`plugins/tasks/plugins/tasks-core/web/__tests__/x.tsx`",
          "`plugins/tasks/plugins/tasks-core/server/internal/tables.test.ts`",
          "@plugins/database/plugins/db-test-fixture/server/testing",
        ),
      ]),
    ).toEqual([
      "@plugins/database/plugins/db-test-fixture/server/testing",
      "plugins/tasks/plugins/tasks-core/server/internal/tables.test.ts",
      "plugins/tasks/plugins/tasks-core/server/testing/install-schema.ts",
      "plugins/tasks/plugins/tasks-core/web/__tests__/x.tsx",
    ]);
  });

  test("passes production paths, dotted ids and plain words", () => {
    expect(
      testCodeInFacts([
        fact(
          "`plugins/tasks/plugins/tasks-core/server/internal/tables.ts`",
          "`primitives/rank.RankExecutor`",
          "`framework/tooling/test-layout` (table `testing_ext_x`)",
          "used for testing",
        ),
      ]),
    ).toEqual([]);
  });
});

test("assertNoTestCodeInFacts names the facet, plugin and path", () => {
  expect(() =>
    assertNoTestCodeInFacts({
      pluginId: "tasks.tasks-core",
      facetId: "db-schema",
      facts: [fact("`plugins/tasks/plugins/tasks-core/server/testing/x.ts`")],
    }),
  ).toThrow(
    /db-schema.*tasks\.tasks-core[\s\S]*plugins\/tasks\/plugins\/tasks-core\/server\/testing\/x\.ts/,
  );
});

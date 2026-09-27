import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { collectContributions } from "./contributions";
import {
  Resource,
  assertPreloadedResourcesDeclared,
  defineResource,
  undeclaredPreloadedKeys,
} from "./resources";

describe("undeclaredPreloadedKeys", () => {
  test("names each preloaded key no Declare carries, sorted", () => {
    expect(
      undeclaredPreloadedKeys(
        ["b", "declared", "a"],
        [{ key: "declared", mode: "push", preload: "boot" }],
      ),
    ).toEqual(["a", "b"]);
  });

  test("a Declare that lost its preload flag does not count", () => {
    expect(
      undeclaredPreloadedKeys(["k"], [{ key: "k", mode: "push" }]),
    ).toEqual(["k"]);
  });

  test("either preload value counts, and non-preloaded Declares are irrelevant", () => {
    expect(
      undeclaredPreloadedKeys(
        ["boot", "kept"],
        [
          { key: "boot", mode: "push", preload: "boot" },
          { key: "kept", mode: "keyed", preload: "boot-and-keep" },
          { key: "other", mode: "invalidate" },
        ],
      ),
    ).toEqual([]);
  });
});

// Through the facade's own runtime and Declare token, as boot calls it. The
// runtime is a process singleton other suites may also register preloaded
// resources on, so each expectation is scoped to this suite's own key.
describe("assertPreloadedResourcesDeclared", () => {
  const key = "server-core-test.preload-declare";
  const preloaded = defineResource(
    { key, schema: z.number(), preload: "boot" },
    { mode: "push", loader: () => 1 },
  );
  const named = `"${key}"`;

  test("throws naming a registered preloaded resource with no Declare, and says how to fix it", () => {
    collectContributions([{ id: "test/plugin", contributions: [] }]);
    expect(assertPreloadedResourcesDeclared).toThrow(named);
    expect(assertPreloadedResourcesDeclared).toThrow("...served.declare");
  });

  test("its Declare clears it", () => {
    collectContributions([
      { id: "test/plugin", contributions: [Resource.Declare(preloaded)] },
    ]);
    expect(assertPreloadedResourcesDeclared).not.toThrow(named);
  });
});

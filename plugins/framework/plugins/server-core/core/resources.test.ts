import { afterAll, describe, expect, test } from "bun:test";
import { z } from "zod";
import { collectContributions } from "./contributions";
import {
  Resource,
  assertPreloadedResourcesDeclared,
  clearRelationBases,
  defineResource,
  setRelationBases,
  undeclaredPreloadedKeys,
} from "./resources";
import { readSetVersion } from "./read-set";

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
    { key, schema: z.number(), preload: "boot", validateParams: () => {} },
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

// Every read a contribution token publishes works on `Resource.Declare` —
// each used to be copied by hand onto a wrapper, and two were missing at
// runtime while still type-checking.
describe("Resource.Declare reads", () => {
  const key = "server-core-test.declare-reads";
  const served = defineResource(
    { key, schema: z.number(), preload: "boot", validateParams: () => {} },
    { mode: "push", loader: () => 1 },
  );
  const plugins = [
    { id: "test/plugin", contributions: [Resource.Declare(served)] },
  ];
  const payload = { key, mode: "push", preload: "boot" };

  test("from() reads the payload off plugin definitions — and only the payload", () => {
    const [declared] = Resource.Declare.from(plugins);
    expect(declared).toMatchObject(payload);
    expect("loader" in declared!).toBe(false);
  });

  test("getContributionsIfCollected() and getContributions() agree after collection", () => {
    collectContributions(plugins);
    const mine = (cs: readonly { key: string }[] | undefined) =>
      cs?.filter((c) => c.key === key);
    expect(mine(Resource.Declare.getContributionsIfCollected())).toEqual(
      mine(Resource.Declare.getContributions()),
    );
    expect(mine(Resource.Declare.getContributions())).toEqual([
      expect.objectContaining(payload),
    ]);
  });
});

describe("setRelationBases", () => {
  // The holder is process-global: leave it unset for the next suite.
  afterAll(clearRelationBases);
  // D33: the router memoizes its inversion on the read-set version, so new
  // bases must move it — or the memo would keep serving the old expansion.
  test("moves the read-set version", () => {
    const before = readSetVersion();
    setRelationBases((r) => [r]);
    expect(readSetVersion()).toBe(before + 1);
  });
  test("clearRelationBases moves the version too", () => {
    const before = readSetVersion();
    clearRelationBases();
    expect(readSetVersion()).toBe(before + 1);
  });
});

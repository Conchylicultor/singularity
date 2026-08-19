import { describe, expect, test } from "bun:test";
import { declarePluginSlots } from "@plugins/framework/plugins/slot-declaration/core";
import type { ExtractContext } from "@plugins/plugin-meta/plugins/facets/core";
import type { ContributionsFacetData } from "../core";
import contributionsFacet from "./index";

// The guard reads process-global state (how many declaration passes have run),
// so these tests are ORDER-DEPENDENT by nature: the "no pass yet" case must run
// before anything calls `declarePluginSlots`. bun:test runs a file's tests in
// declaration order, and nothing imported here declares slots, so the first test
// below genuinely observes a virgin process. Keep the order.

// A plugin dir that cannot exist, so the static half of `extract` reads no files
// and the test stays hermetic — no tree build, no barrel imports, no disk.
const ctx = (
  importedModules: ExtractContext["importedModules"],
): ExtractContext => ({
  dir: "/nonexistent/plugin-dir-for-declaration-guard-test",
  pluginId: "declaration.guard.test",
  importedModules,
});

const oneWebModule: ExtractContext["importedModules"] = [
  {
    mod: { default: { contributions: [{ _slotId: "Fake.Slot" }] } },
    runtime: "web",
  },
];

const extract = (importedModules: ExtractContext["importedModules"]) =>
  contributionsFacet.extract(ctx(importedModules)) as ContributionsFacetData;

describe("contributions facet declaration guard", () => {
  test("throws when barrels are imported before any slot-declaration pass", () => {
    expect(() => extract(oneWebModule)).toThrow(/no slot-declaration pass/);
  });

  test("a barrel-free extraction is untouched — no modules, nothing to under-report", () => {
    expect(extract([])).toEqual({ static: [], runtime: [] });
  });

  test("reads the contributions once a pass has run, even an empty one", () => {
    // An empty pass still counts: a plugin set that declares no slots is a real
    // pass, not a missing one.
    declarePluginSlots([]);
    expect(extract(oneWebModule).runtime).toEqual([
      {
        kind: "slot",
        slotId: "Fake.Slot",
        componentName: undefined,
        doc: {},
        id: undefined,
      },
    ]);
  });
});

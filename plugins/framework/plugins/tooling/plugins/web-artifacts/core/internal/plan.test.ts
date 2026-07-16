import { describe, expect, test } from "bun:test";
import { buildImportMap } from "../import-map";
import {
  artifactUrl,
  closureSpecsOf,
  composeMapEntries,
  pluginIdOf,
  type PlannedTarget,
} from "./plan";
import type { ArtifactMeta } from "./store";
import type { VendorSetMeta } from "./vendors";

function target(partial: Pick<PlannedTarget, "dirName" | "specifier">): PlannedTarget {
  return {
    ...partial,
    kind: "web",
    pluginPath: "x",
    entryFile: "/x/web/index.ts",
    inputsHash: "0".repeat(64),
    needsBuild: false,
  };
}

describe("composeMapEntries (the expected-map assembly shared with compose)", () => {
  const vendorMeta: VendorSetMeta = {
    entries: { react: "react.js", "react-dom/client": "react-dom__client.js" },
    imports: {},
    setHash: "f".repeat(64),
  };

  test("targets + registry alias + vendor entries, entry artifact excluded", () => {
    const entries = composeMapEntries({
      targets: [
        target({ dirName: "tasks.web.abc", specifier: "@plugins/tasks/web" }),
        target({ dirName: "tasks.core.def", specifier: "@plugins/tasks/core" }),
        target({ dirName: "web-core.entry.123", specifier: null }), // entry: no map entry
      ],
      registryDirName: "composition-web-registry.registry.999",
      vendorMeta,
    });
    const map = buildImportMap(entries).imports;
    expect(map).toEqual({
      "@composition-web-registry": "/artifacts/composition-web-registry.registry.999/index.js",
      "@plugins/tasks/core": "/artifacts/tasks.core.def/index.js",
      "@plugins/tasks/web": "/artifacts/tasks.web.abc/index.js",
      react: `/artifacts/set.${"f".repeat(16)}/react.js`,
      "react-dom/client": `/artifacts/set.${"f".repeat(16)}/react-dom__client.js`,
    });
  });

  test("map recompute is a pure function of targets — same input, same map", () => {
    const make = () =>
      buildImportMap(
        composeMapEntries({
          targets: [target({ dirName: "a.web.1", specifier: "@plugins/a/web" })],
          registryDirName: "composition-web-registry.registry.2",
          vendorMeta,
        }),
      ).imports;
    expect(make()).toEqual(make());
  });
});

describe("closureSpecsOf (which emitted imports extend the barrel closure)", () => {
  const meta = (partial: Pick<ArtifactMeta, "staticImports" | "dynamicImports">): ArtifactMeta => ({
    specifier: "@plugins/x/web",
    kind: "web",
    pluginPath: "x",
    inputsHash: "0".repeat(64),
    builtAtMs: 0,
    ...partial,
  });

  test("static imports always extend the closure — even browser-unreachable kinds", () => {
    expect(
      closureSpecsOf(
        meta({
          staticImports: ["@plugins/a/core", "@plugins/b/prewarm"],
          dynamicImports: [],
        }),
      ),
    ).toEqual(["@plugins/a/core", "@plugins/b/prewarm"]);
  });

  test("dynamic folder-barrel imports extend the closure (lazy artifacts get mapped)", () => {
    expect(
      closureSpecsOf(
        meta({
          staticImports: [],
          dynamicImports: [
            "@plugins/primitives/plugins/icon-picker/core",
            "@plugins/primitives/plugins/css/plugins/pin/fixtures",
          ],
        }),
      ),
    ).toEqual([
      "@plugins/primitives/plugins/icon-picker/core",
      "@plugins/primitives/plugins/css/plugins/pin/fixtures",
    ]);
  });

  test("dynamic imports of browser-unreachable kinds are exempt (skipped)", () => {
    expect(
      closureSpecsOf(
        meta({
          staticImports: ["@plugins/infra/plugins/asset-mirror/core"],
          dynamicImports: [
            "@plugins/apps/plugins/sonata/plugins/audio/plugins/piano/prewarm",
            "@plugins/primitives/plugins/icon-picker/core",
          ],
        }),
      ),
    ).toEqual([
      "@plugins/infra/plugins/asset-mirror/core",
      "@plugins/primitives/plugins/icon-picker/core",
    ]);
  });
});

describe("plan identity helpers", () => {
  test("pluginIdOf flattens nesting", () => {
    expect(pluginIdOf("framework/plugins/tooling/plugins/web-artifacts")).toBe(
      "framework.tooling.web-artifacts",
    );
  });

  test("artifactUrl shape", () => {
    expect(artifactUrl("tasks.web.abc")).toBe("/artifacts/tasks.web.abc/index.js");
  });
});

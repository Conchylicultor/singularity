import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildImportMap } from "../import-map";
import {
  artifactUrl,
  closureSpecsOf,
  composeMapEntries,
  eagerWebTargets,
  planFleet,
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
  const meta = (
    partial: Pick<ArtifactMeta, "staticImportsByFile" | "dynamicImports">,
  ): ArtifactMeta => ({
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
          staticImportsByFile: { "index.js": ["@plugins/a/core", "@plugins/b/prewarm"] },
          dynamicImports: [],
        }),
      ),
    ).toEqual(["@plugins/a/core", "@plugins/b/prewarm"]);
  });

  test("static imports of code-split chunks extend the closure like the entry's", () => {
    expect(
      closureSpecsOf(
        meta({
          staticImportsByFile: {
            "index.js": ["@plugins/a/core"],
            "impl-abc.mjs": ["@plugins/lazy-only/core", "@plugins/a/core"],
          },
          dynamicImports: [],
        }),
      ),
    ).toEqual(["@plugins/a/core", "@plugins/lazy-only/core"]);
  });

  test("dynamic folder-barrel imports extend the closure (lazy artifacts get mapped)", () => {
    expect(
      closureSpecsOf(
        meta({
          staticImportsByFile: {},
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
          staticImportsByFile: { "index.js": ["@plugins/infra/plugins/asset-mirror/core"] },
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

describe("eagerWebTargets (the preload-seed selection, a pure membership test)", () => {
  const targets = [
    target({ dirName: "shell.web.1", specifier: "@plugins/shell/web" }),
    target({ dirName: "tasks.web.2", specifier: "@plugins/tasks/web" }),
  ].map((t, i) => ({ ...t, pluginPath: i === 0 ? "shell" : "tasks" }));

  test("filters the deferred paths out of the entry set", () => {
    expect(eagerWebTargets(targets, new Set(["tasks"])).map((t) => t.pluginPath)).toEqual([
      "shell",
    ]);
  });

  test("a deferred superset is exact on the filtered entries (composition source)", () => {
    // The full DEFERRED_PLUGIN_PATHS may name plugins outside a composition's
    // filtered registry — membership filtering must not care.
    expect(
      eagerWebTargets(targets, new Set(["tasks", "not-in-this-composition"])).map(
        (t) => t.pluginPath,
      ),
    ).toEqual(["shell"]);
  });
});

describe("planFleet with an injected fleet source", () => {
  const repoRoot = join(import.meta.dir, "../".repeat(8));
  const tmp = mkdtempSync(join(tmpdir(), "fleet-source-test-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  test("plans targets from the source's entries and slugs the registry per source", async () => {
    const registryFile = join(tmp, "web.composition.testcomp.generated.ts");
    writeFileSync(registryFile, "export const webEntries = [];\n");

    const deferredPaths = new Set(["some/deferred/path"]);
    const plan = await planFleet({
      root: repoRoot,
      minify: false,
      cache: { version: 1, records: {} },
      source: {
        webEntries: [{ pluginPath: "shell", id: "shell", dependsOn: [] }],
        deferredPaths,
        registryFile,
        registrySlug: "web-registry-testcomp",
      },
    });

    expect(plan.webTargets.map((t) => t.specifier)).toEqual(["@plugins/shell/web"]);
    expect(plan.registryTarget.dirName.startsWith("web-registry-testcomp.registry.")).toBe(true);
    expect(plan.registryTarget.registryFile).toBe(registryFile);
    expect(plan.deferredPaths).toBe(deferredPaths);
  });

  test("the registry store name is a pure function of source content + slug", async () => {
    const registryFile = join(tmp, "web.composition.other.generated.ts");
    writeFileSync(registryFile, "export const webEntries = [];\n");
    const source = {
      webEntries: [],
      deferredPaths: new Set<string>(),
      registryFile,
      registrySlug: "web-registry-other",
    };
    const opts = { root: repoRoot, minify: false, source };
    const a = await planFleet({ ...opts, cache: { version: 1, records: {} } });
    const b = await planFleet({ ...opts, cache: { version: 1, records: {} } });
    expect(a.registryTarget.dirName).toBe(b.registryTarget.dirName);
    // Same content as testcomp's registry, different slug ⇒ different store dir.
    expect(a.registryTarget.dirName.startsWith("web-registry-other.registry.")).toBe(true);
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

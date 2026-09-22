import { describe, expect, test } from "bun:test";
import { zone } from "./config";
import { buildZoneMap, type PluginDirs } from "./resolve";

// A two-level tree: `alpha`, and `alpha`'s child `beta`. Only `id` and `path`
// are read, so that is all the fake nodes carry.
const tree: PluginDirs = {
  byDir: new Map([
    ["/repo/plugins/alpha", { id: "alpha", path: "alpha" }],
    [
      "/repo/plugins/alpha/plugins/beta",
      { id: "alpha.beta", path: "alpha/plugins/beta" },
    ],
  ]),
};

const zoneMap = buildZoneMap(
  "/repo",
  [zone("plugin", { match: "plugins", discover: "plugin-tree" })],
  tree,
  new Set(["web", "server", "core", "shared", "data-dirs"]),
);

// Built from a prefix rather than written whole: `alpha` is not a real plugin,
// and `plugin-refs-resolve` rejects a `"plugins/…"` literal that names none.
const PLUGINS = "plugins";
const ALPHA_CORE = `${PLUGINS}/alpha/core/internal/thing.ts`;
const BETA_WEB = `${PLUGINS}/alpha/plugins/beta/web/components/view.tsx`;

describe("resolveImport — relative specifiers", () => {
  test("into the plugin's own runtime folders", () => {
    expect(zoneMap.resolveImport(ALPHA_CORE, "../../server/x")).toEqual({
      zone: "plugin.alpha",
      runtime: "server",
    });
    expect(zoneMap.resolveImport(ALPHA_CORE, "../../shared")).toEqual({
      zone: "plugin.alpha",
      runtime: "shared",
    });
    expect(zoneMap.resolveImport(ALPHA_CORE, "../../data-dirs")).toEqual({
      zone: "plugin.alpha",
      runtime: "data-dirs",
    });
  });

  test("a deep file keeps the folder it sits in", () => {
    expect(zoneMap.resolveImport(ALPHA_CORE, "./other/deep/file")).toEqual({
      zone: "plugin.alpha",
      runtime: "core",
    });
  });

  test("a child plugin climbing into its parent lands in the parent's zone", () => {
    expect(zoneMap.resolveImport(BETA_WEB, "../../../../web")).toEqual({
      zone: "plugin.alpha",
      runtime: "web",
    });
  });

  test("a loose file at the plugin root has no runtime", () => {
    expect(zoneMap.resolveImport(ALPHA_CORE, "../../config")).toEqual({
      zone: "plugin.alpha",
      runtime: null,
    });
  });

  test("a path leaving plugins/ resolves to nothing", () => {
    expect(
      zoneMap.resolveImport(ALPHA_CORE, "../../../../web/main"),
    ).toBeNull();
    expect(
      zoneMap.resolveImport(ALPHA_CORE, "../../../../../../outside"),
    ).toBeNull();
  });
});

describe("resolveImport — alias specifiers", () => {
  test("the plugin's own alias resolves like any other plugin's", () => {
    expect(zoneMap.resolveImport(ALPHA_CORE, "@plugins/alpha/web")).toEqual({
      zone: "plugin.alpha",
      runtime: "web",
    });
  });

  test("the longest plugin prefix wins", () => {
    expect(
      zoneMap.resolveImport(ALPHA_CORE, "@plugins/alpha/plugins/beta/core"),
    ).toEqual({ zone: "plugin.alpha.beta", runtime: "core" });
  });

  test("a bare npm package resolves to nothing", () => {
    expect(zoneMap.resolveImport(ALPHA_CORE, "react")).toBeNull();
  });
});

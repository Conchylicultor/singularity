import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ownFolderBarrelPlugin, parseEmittedImports } from "./vite-builder";

// Regression: an artifact with internal dynamic imports code-splits into `.mjs`
// chunks; their imports were once invisible (only `index.js` was scanned), so
// specifiers imported only by a lazy chunk got no vendor/map entry and failed
// at runtime ("Failed to resolve module specifier").
describe("parseEmittedImports", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("scans .mjs chunks, records statics per file and dynamics as a union", async () => {
    dir = mkdtempSync(join(tmpdir(), "web-artifacts-test-"));
    writeFileSync(
      join(dir, "index.js"),
      `import { a } from "./chunk-abc.mjs";\nexport { a };\n`,
    );
    writeFileSync(
      join(dir, "chunk-abc.mjs"),
      `import { x } from "@plugins/some/core";\n` +
        `const lazy = () => import("./impl-def.mjs");\nexport const a = [x, lazy];\n`,
    );
    writeFileSync(
      join(dir, "impl-def.mjs"),
      `import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";\n` +
        `export const b = PlainTextPlugin;\n`,
    );
    writeFileSync(join(dir, "index.js.map"), "{}"); // sourcemaps are not modules

    const { staticImportsByFile, dynamicImports } =
      await parseEmittedImports(dir);
    expect(staticImportsByFile).toEqual({
      "index.js": ["./chunk-abc.mjs"],
      "chunk-abc.mjs": ["@plugins/some/core"],
      "impl-def.mjs": ["@lexical/react/LexicalPlainTextPlugin"],
    });
    expect(dynamicImports).toEqual(["./impl-def.mjs"]);
  });
});

// A deep import into an own non-inlined folder used to be rewritten to that
// folder's barrel, so a symbol the barrel did not export type-checked green and
// failed only at compose. Only the barrel spelling is routed now.
describe("ownFolderBarrelPlugin", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function setup(): {
    resolveId: (id: string, importer: string) => unknown;
    pluginDir: string;
  } {
    dir = mkdtempSync(join(tmpdir(), "web-artifacts-own-folder-"));
    const pluginDir = join(dir, "plugins", "demo");
    mkdirSync(join(pluginDir, "core"), { recursive: true });
    writeFileSync(join(pluginDir, "core", "index.ts"), "export {};\n");
    const plugin = ownFolderBarrelPlugin("demo", pluginDir, "web");
    const hook = plugin.resolveId as (id: string, importer: string) => unknown;
    return {
      resolveId: (id, importer) => hook.call({}, id, importer),
      pluginDir,
    };
  }

  test("routes the barrel spelling to the external barrel", () => {
    const { resolveId, pluginDir } = setup();
    const importer = join(pluginDir, "web", "components", "a.tsx");
    const external = { id: "@plugins/demo/core", external: true };
    expect(resolveId("../../core", importer)).toEqual(external);
    expect(resolveId("../../core/index.ts", importer)).toEqual(external);
    expect(resolveId(join(pluginDir, "core"), importer)).toEqual(external);
  });

  test("refuses a deep path, naming the importer and the fix", () => {
    const { resolveId, pluginDir } = setup();
    const importer = join(pluginDir, "web", "components", "a.tsx");
    expect(() => resolveId("../../core/merge-group-values", importer)).toThrow(
      /a\.tsx imports "\.\.\/\.\.\/core\/merge-group-values".*no-deep-own-folder-import/s,
    );
  });

  test("leaves the artifact's own and shared folders to be inlined", () => {
    const { resolveId, pluginDir } = setup();
    const importer = join(pluginDir, "web", "components", "a.tsx");
    expect(resolveId("../internal/x", importer)).toBeNull();
    expect(resolveId("../../shared/x", importer)).toBeNull();
  });
});

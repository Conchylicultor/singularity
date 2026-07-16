import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanStagedModules } from "./staged-verify";

describe("scanStagedModules (ground-truth scan of the staged dist)", () => {
  let staging: string;
  afterEach(() => rmSync(staging, { recursive: true, force: true }));

  const artifact = (linkName: string, files: Record<string, string>): void => {
    const dir = join(staging, "artifacts", linkName);
    mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), content);
    }
  };

  test("verifies every staged file — chunks included — against the map", async () => {
    staging = mkdtempSync(join(tmpdir(), "staged-verify-"));
    artifact("a.web.111", {
      "index.js": `import "./chunk-abc.mjs"; import "mapped-pkg";\n`,
      // The exact outage shape: a lazy chunk importing an unmapped bare spec.
      "chunk-abc.mjs": `import "unmapped-pkg"; import "./missing-chunk.mjs";\n`,
      "index.js.map": "{}", // sourcemaps are not modules
    });
    artifact("b.web.222", {
      "index.js":
        `const lazyOk = () => import("@plugins/x/prewarm");\n` + // browser-unreachable: silent
        `const lazyBad = () => import("unmapped-dyn");\n`, // plain dynamic miss: warning
    });
    artifact("composition-web-registry.registry.333", {
      "index.js": `export const load = () => import("@plugins/y/web");\n`, // registry: strict
    });

    const { failures, warnings } = await scanStagedModules({
      stagingDir: staging,
      imports: { "mapped-pkg": "/artifacts/set.f/mapped-pkg.js" },
    });
    expect(failures).toEqual([
      { specifier: "unmapped-pkg", file: "artifacts/a.web.111/chunk-abc.mjs" },
      { specifier: "./missing-chunk.mjs", file: "artifacts/a.web.111/chunk-abc.mjs" },
      {
        specifier: "@plugins/y/web",
        file: "artifacts/composition-web-registry.registry.333/index.js",
      },
    ]);
    expect(warnings).toEqual([
      { specifier: "unmapped-dyn", file: "artifacts/b.web.222/index.js" },
    ]);
  });

  test("a fully-mapped staged tree passes clean", async () => {
    staging = mkdtempSync(join(tmpdir(), "staged-verify-"));
    artifact("a.web.111", {
      "index.js": `import "./chunk.mjs"; import "react";\n`,
      "chunk.mjs": `export const x = 1;\n`,
    });
    const { failures, warnings } = await scanStagedModules({
      stagingDir: staging,
      imports: { react: "/artifacts/set.f/react.js" },
    });
    expect(failures).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

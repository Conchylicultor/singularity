import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEmittedImports } from "./vite-builder";

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

    const { staticImportsByFile, dynamicImports } = await parseEmittedImports(dir);
    expect(staticImportsByFile).toEqual({
      "index.js": ["./chunk-abc.mjs"],
      "chunk-abc.mjs": ["@plugins/some/core"],
      "impl-def.mjs": ["@lexical/react/LexicalPlainTextPlugin"],
    });
    expect(dynamicImports).toEqual(["./impl-def.mjs"]);
  });
});

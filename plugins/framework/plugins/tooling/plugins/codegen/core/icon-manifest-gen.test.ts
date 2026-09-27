import { describe, expect, it } from "bun:test";
import { scanIconNames } from "./icon-manifest-gen";

const IMPORT = `import { symbol, brand } from "@plugins/ui/plugins/icons/core";\n`;

describe("scanIconNames", () => {
  it("collects symbol and brand literals from a file importing the icons core", () => {
    expect(
      scanIconNames(
        `${IMPORT}const a = symbol("forum");\nconst b = brand('github');\nconst c = symbol( "keep" );`,
        "x.ts",
      ),
    ).toEqual({ symbols: ["forum", "keep"], brands: ["github"] });
  });

  it("ignores files that do not import the icons core", () => {
    expect(scanIconNames(`const a = symbol(x);`, "x.ts")).toEqual({
      symbols: [],
      brands: [],
    });
  });

  it("ignores member calls, declarations, comments and strings", () => {
    expect(
      scanIconNames(
        `${IMPORT}// symbol("commented")\nconst s = "symbol(\\"quoted\\")";\nfoo.symbol(x);\nexport function symbol(name) {}`,
        "x.ts",
      ),
    ).toEqual({ symbols: [], brands: [] });
  });

  it("throws on a non-literal name", () => {
    expect(() => scanIconNames(`${IMPORT}symbol(name);`, "x.ts")).toThrow(
      /x\.ts:2: symbol\(…\) id is not a static string literal/,
    );
  });
});

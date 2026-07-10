import { describe, expect, it } from "bun:test";
import { parsePluginBarrel } from "./barrel-meta";

// Deliberately not a real `plugins/<id>/…` path: `plugin-refs-resolve` scans
// string literals for plugin references and would try to resolve a fixture one.
const FILE = "<fixture>/web/index.ts";

describe("parsePluginBarrel", () => {
  it("reads a realistic barrel's description", () => {
    const src = `import definePlugin from "@x";
export default {
  description: "A useful plugin.",
  contributions: [someSlot.contribute(() => null)],
} satisfies PluginDefinition;
`;
    expect(parsePluginBarrel(src, FILE).description).toBe("A useful plugin.");
  });

  it("round-trips a description containing an escaped double-quote (the reported bug)", () => {
    const src = `export default {
  description: "verifies an FK onDelete:\\"cascade\\" bound",
} satisfies PluginDefinition;
`;
    expect(parsePluginBarrel(src, FILE).description).toBe(
      'verifies an FK onDelete:"cascade" bound',
    );
  });

  it("treats a missing description as absent, with flags false", () => {
    const src = `export default {} satisfies PluginDefinition;`;
    const meta = parsePluginBarrel(src, FILE);
    expect(meta.description).toBeUndefined();
    expect(meta.loadBearing).toBe(false);
    expect(meta.collapsed).toBe(false);
  });

  it("reads loadBearing / collapsed flags", () => {
    const src = `export default {
  description: "x",
  loadBearing: true,
  collapsed: true,
} satisfies PluginDefinition;`;
    const meta = parsePluginBarrel(src, FILE);
    expect(meta.loadBearing).toBe(true);
    expect(meta.collapsed).toBe(true);
  });

  it("throws on a non-literal description, naming the file and the expression", () => {
    const src = `const MY_CONST = "x";
export default { description: MY_CONST } satisfies PluginDefinition;`;
    expect(() => parsePluginBarrel(src, FILE)).toThrow(FILE);
    expect(() => parsePluginBarrel(src, FILE)).toThrow(/MY_CONST/);
  });

  it("throws when there is no default export object literal", () => {
    const src = `export const x = 1;`;
    expect(() => parsePluginBarrel(src, FILE)).toThrow(FILE);
  });

  it("does not let a nested contribution's description / loadBearing leak into the top level", () => {
    const src = `export default {
  contributions: [
    someSlot.contribute({
      description: "nested widget description",
      loadBearing: true,
    }),
  ],
} satisfies PluginDefinition;`;
    const meta = parsePluginBarrel(src, FILE);
    expect(meta.description).toBeUndefined();
    expect(meta.loadBearing).toBe(false);
  });
});

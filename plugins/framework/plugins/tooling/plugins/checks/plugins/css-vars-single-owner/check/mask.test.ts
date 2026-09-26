import { describe, expect, test } from "bun:test";
import { maskNonDeclarations } from "./mask";

const declared = (css: string) =>
  [...maskNonDeclarations(css).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);

describe("maskNonDeclarations", () => {
  test("keeps a plain declaration", () => {
    expect(declared(":root { --a: 1px; }")).toEqual(["--a"]);
  });

  test("masks @theme blocks and comments", () => {
    expect(declared("@theme inline { --a: 1px; } /* --b: 2px */")).toEqual([]);
  });

  test("masks a container style-query condition but not the rules inside", () => {
    const css = `@container style(--mode: custom) { ::x { --c: var(--mode); width: 1px; } }`;
    expect(declared(css)).toEqual(["--c"]);
  });

  test("masks nested parentheses inside the condition", () => {
    const css = `@container style((--a: 1) and (--b: 2)) { p { color: red; } }`;
    expect(declared(css)).toEqual([]);
  });
});

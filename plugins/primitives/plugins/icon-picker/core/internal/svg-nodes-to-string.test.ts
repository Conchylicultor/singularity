import { describe, expect, test } from "bun:test";
import type { SvgNode } from "../index";
import { svgNodesToString } from "./svg-nodes-to-string";

describe("svgNodesToString", () => {
  test("self-closes a leaf node and serializes attrs", () => {
    const nodes: SvgNode[] = [{ tag: "path", attr: { d: "M0 0h24v24H0z" }, child: [] }];
    expect(svgNodesToString(nodes)).toBe(`<path d="M0 0h24v24H0z"/>`);
  });

  test("recurses over children with open/close tags", () => {
    const nodes: SvgNode[] = [
      {
        tag: "g",
        attr: { id: "a" },
        child: [{ tag: "circle", attr: { cx: "12", cy: "12", r: "8" }, child: [] }],
      },
    ];
    expect(svgNodesToString(nodes)).toBe(`<g id="a"><circle cx="12" cy="12" r="8"/></g>`);
  });

  test("escapes attribute values", () => {
    const nodes: SvgNode[] = [{ tag: "path", attr: { title: `a&b<c>d"e` }, child: [] }];
    expect(svgNodesToString(nodes)).toBe(`<path title="a&amp;b&lt;c&gt;d&quot;e"/>`);
  });

  test("serializes multiple sibling nodes in order", () => {
    const nodes: SvgNode[] = [
      { tag: "path", attr: { d: "M1" }, child: [] },
      { tag: "path", attr: { d: "M2" }, child: [] },
    ];
    expect(svgNodesToString(nodes)).toBe(`<path d="M1"/><path d="M2"/>`);
  });
});

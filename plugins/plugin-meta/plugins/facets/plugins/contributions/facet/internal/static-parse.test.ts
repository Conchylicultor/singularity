import { describe, expect, test } from "bun:test";
import { maskSource } from "@plugins/plugin-meta/plugins/parse-utils/core";
import { findCalls, parsePropsBlock } from "./static-parse";

// findCalls locates calls over a fully-masked buffer and slices callee/argsBody
// from the original at the aligned offsets — exactly as the facet caller does
// (`maskSource(stripped)` + the block slice). maskSource preserves length, so a
// snippet and its mask index 1:1.
const calls = (block: string) => findCalls(maskSource(block), block);

describe("findCalls", () => {
  test("captures a bare-identifier-arg contribution call", () => {
    expect(calls("DataViewSlots.Filter(textOperatorSet)")).toEqual([
      { callee: "DataViewSlots.Filter", argsBody: "" },
    ]);
  });

  test("still captures and parses an inline object-literal argument", () => {
    const found = calls(`DataViewSlots.Cell({ match: "bool", component: BoolCell })`);
    expect(found).toHaveLength(1);
    expect(found[0]!.callee).toBe("DataViewSlots.Cell");
    const props = parsePropsBlock(found[0]!.argsBody);
    expect(props.match).toContain("bool");
  });

  test("does not emit a phantom slot for a dotted call nested inside an argument", () => {
    const found = calls(`DataViewSlots.Cell({ component: wrap(Foo.bar(x)) })`);
    expect(found.map((c) => c.callee)).toEqual(["DataViewSlots.Cell"]);
  });

  test("does not false-match a dotted call inside a preserved string", () => {
    const found = calls(`DataViewSlots.Filter(set /* */) , X.y({ label: "a.b(c" })`);
    expect(found.map((c) => c.callee)).toEqual(["DataViewSlots.Filter", "X.y"]);
  });
});

import { describe, expect, it } from "bun:test";
import type { Block } from "../../core";
import { computeFrameSpans, type FlatBlock } from "./block-frames";

/** A flatten entry; only `id`/`type`/`depth` matter to the span computation. */
function entry(id: string, type: string, depth: number): FlatBlock {
  return {
    block: { id, type } as unknown as Block,
    depth,
    hasChildren: false,
    ordinal: 1,
    firstVisibleChildType: null,
  };
}

/** Spans as readable `id:start-end` triples. */
function spans(flat: FlatBlock[], framed: Set<string>): string[] {
  return computeFrameSpans(flat, framed).map((s) => `${s.block.id}:${s.start}-${s.end}`);
}

const FRAMED = new Set(["callout"]);

describe("computeFrameSpans", () => {
  it("returns nothing when no container types are registered", () => {
    const flat = [entry("a", "callout", 0), entry("b", "text", 1)];
    expect(computeFrameSpans(flat, new Set())).toEqual([]);
  });

  it("ignores a non-container block's children", () => {
    const flat = [entry("a", "text", 0), entry("b", "text", 1)];
    expect(spans(flat, FRAMED)).toEqual([]);
  });

  it("spans a container's contiguous descendant run", () => {
    const flat = [
      entry("before", "text", 0),
      entry("call", "callout", 0),
      entry("kid1", "text", 1),
      entry("grandkid", "text", 2),
      entry("kid2", "text", 1),
      entry("after", "text", 0),
    ];
    expect(spans(flat, FRAMED)).toEqual(["call:1-4"]);
  });

  it("spans a collapsed (childless) container over its own row alone", () => {
    const flat = [entry("call", "callout", 0), entry("after", "text", 0)];
    expect(spans(flat, FRAMED)).toEqual(["call:0-0"]);
  });

  it("spans a container that runs to the end of the document", () => {
    const flat = [
      entry("a", "text", 0),
      entry("call", "callout", 0),
      entry("kid", "text", 1),
    ];
    expect(spans(flat, FRAMED)).toEqual(["call:1-2"]);
  });

  it("nests a container inside a container without partial overlap", () => {
    const flat = [
      entry("outer", "callout", 0),
      entry("kid", "text", 1),
      entry("inner", "callout", 1),
      entry("innerkid", "text", 2),
      entry("tail", "text", 1),
    ];
    // outer covers everything; inner covers only its own subtree, fully inside.
    expect(spans(flat, FRAMED)).toEqual(["outer:0-4", "inner:2-3"]);
  });

  it("spans a container nested under a plain block", () => {
    const flat = [
      entry("a", "text", 0),
      entry("call", "callout", 1),
      entry("kid", "text", 2),
      entry("b", "text", 0),
    ];
    expect(spans(flat, FRAMED)).toEqual(["call:1-2"]);
  });

  it("spans two sibling containers independently", () => {
    const flat = [
      entry("c1", "callout", 0),
      entry("k1", "text", 1),
      entry("c2", "callout", 0),
      entry("k2", "text", 1),
    ];
    expect(spans(flat, FRAMED)).toEqual(["c1:0-1", "c2:2-3"]);
  });

  it("never spans past a shallower or equal-depth block", () => {
    const flat = [
      entry("call", "callout", 1),
      entry("kid", "text", 2),
      entry("sibling", "text", 1),
      entry("uncle", "text", 0),
    ];
    const [span] = computeFrameSpans(flat, FRAMED);
    expect(span).toBeDefined();
    expect(span!.end).toBe(1);
  });
});

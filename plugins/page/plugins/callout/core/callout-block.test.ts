import { describe, expect, it } from "bun:test";
import { calloutBlock, calloutDataSchema } from "./callout-block";

/**
 * The callout is a VOID container: `{icon, iconSvgNodes, color}` and nothing
 * else. These cases pin the DERIVATION, not the shape — `acceptsText` and the
 * `text` lens are computed by `defineBlock` from `"text" in schema.shape`, so a
 * regression that re-adds a `text` field to the schema silently makes the
 * container text-bearing again (the exact fusion this design removed) without
 * any handle declaration changing.
 */
describe("calloutDataSchema (void)", () => {
  it("rejects a `text` key at the write boundary", () => {
    // `parse-block-data.ts` parses through `handle.schema.strict()`, so this is
    // literally what POST /api/blocks does with a legacy text-bearing payload.
    const strict = calloutDataSchema.strict().safeParse({
      text: [{ text: "hello" }],
      icon: null,
      iconSvgNodes: null,
      color: "info",
    });
    expect(strict.success).toBe(false);
  });

  it("parses to exactly {icon, iconSvgNodes, color}", () => {
    const parsed = calloutDataSchema.parse({});
    expect(Object.keys(parsed).sort()).toEqual(["color", "icon", "iconSvgNodes"]);
    expect(parsed).toEqual({ icon: null, iconSvgNodes: null, color: "default" });
  });

  it("empty() is exactly the three appearance fields", () => {
    expect(calloutBlock.empty?.()).toEqual({
      icon: null,
      iconSvgNodes: null,
      color: "default",
    });
  });
});

describe("calloutBlock (derived facts)", () => {
  it("derives acceptsText === false and no text lens from the void schema", () => {
    expect(calloutBlock.acceptsText).toBe(false);
    expect(calloutBlock.text).toBeUndefined();
  });

  it("declares the container facts the reducer and the surface read", () => {
    expect(calloutBlock.anchor).toBe(true);
    expect(calloutBlock.wrapOnConvert).toBe(true);
    expect(calloutBlock.collapsible).toBe("never");
    // The seam whose `expanded` gate is what made Enter mint a SECOND callout.
    expect(calloutBlock.splitChildWhenExpanded).toBeUndefined();
  });
});

import { describe, expect, it } from "bun:test";
import { contextBlock, contextDataSchema } from "./context-block";

/**
 * The context card owns NOTHING but its type. These cases pin the void payload
 * at the write boundary — the previous model stored `{ text }` (its title), and a
 * regression that re-adds any field is what would fuse container identity back
 * onto a line of content.
 */
describe("contextDataSchema (void)", () => {
  it("rejects a `text` key at the write boundary", () => {
    // `parse-block-data.ts` parses through `handle.schema.strict()`, so this is
    // literally what POST /api/blocks does with a legacy text-bearing payload.
    const strict = contextDataSchema.strict().safeParse({ text: [{ text: "hello" }] });
    expect(strict.success).toBe(false);
  });

  it("parses to exactly {}", () => {
    expect(contextDataSchema.parse({})).toEqual({});
    expect(contextBlock.empty?.()).toEqual({});
  });
});

describe("contextBlock (derived + forced facts)", () => {
  it("derives acceptsText === false and no text lens from the void schema", () => {
    expect(contextBlock.acceptsText).toBe(false);
    expect(contextBlock.text).toBeUndefined();
  });

  it("is a container: the facts come from `defineContainerBlock`", () => {
    expect(contextBlock.anchor).toBe(true);
    expect(contextBlock.wrapOnConvert).toBe(true);
    // Foldable: no `collapsible` opt-out. A context card holds standing
    // instructions a reader usually wants out of the way, so this is the point.
    expect(contextBlock.collapsible).toBeUndefined();
    // The seam whose `expanded` gate made Enter in the old title row mint a
    // SECOND context card.
    expect(contextBlock.splitChildWhenExpanded).toBeUndefined();
  });

  it("serializes to the marker alone — a void container has no text of its own", () => {
    expect(contextBlock.markdown?.serialize?.({}, { plain: () => "", ordinal: 1 })).toBe(
      "**[Agent context]**",
    );
  });
});

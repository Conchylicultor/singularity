import { describe, expect, it } from "bun:test";
import { agentNotesBlock, agentNotesDataSchema } from "./agent-notes-block";

/**
 * The agent-notes card owns NOTHING but its type. These cases pin the void
 * payload at the write boundary: a field creeping back in (an author string, a
 * title) is what would fuse container identity onto a line of content — the
 * exact regression `page/container` was extracted from.
 */
describe("agentNotesDataSchema (void)", () => {
  it("rejects a `text` key at the write boundary", () => {
    // `parse-block-data.ts` parses through `handle.schema.strict()`, so this is
    // literally what POST /api/blocks does with a text-bearing payload.
    const strict = agentNotesDataSchema.strict().safeParse({ text: [{ text: "hello" }] });
    expect(strict.success).toBe(false);
  });

  it("parses to exactly {}", () => {
    expect(agentNotesDataSchema.parse({})).toEqual({});
    expect(agentNotesBlock.empty?.()).toEqual({});
  });
});

describe("agentNotesBlock (derived + forced facts)", () => {
  it("derives acceptsText === false and no text lens from the void schema", () => {
    expect(agentNotesBlock.acceptsText).toBe(false);
    expect(agentNotesBlock.text).toBeUndefined();
  });

  it("is a container: the three facts come from `defineContainerBlock`", () => {
    expect(agentNotesBlock.anchor).toBe(true);
    expect(agentNotesBlock.wrapOnConvert).toBe(true);
    expect(agentNotesBlock.collapsible).toBe("never");
    expect(agentNotesBlock.splitChildWhenExpanded).toBeUndefined();
  });

  it("serializes to the marker alone — a void container has no text of its own", () => {
    expect(agentNotesBlock.markdown?.serialize?.({}, { plain: () => "", ordinal: 1 })).toBe(
      "**[Agent notes]**",
    );
  });
});

import { describe, expect, it } from "bun:test";
import { privateNotesBlock, privateNotesDataSchema } from "./private-notes-block";

/**
 * The private-note card owns NOTHING but its type — including no visibility
 * field: privacy is a fact of the TYPE, so there can be no state in which a card
 * labelled private is nonetheless shared. These cases pin the void payload at
 * the write boundary.
 */
describe("privateNotesDataSchema (void)", () => {
  it("rejects a `text` key at the write boundary", () => {
    // `parse-block-data.ts` parses through `handle.schema.strict()`, so this is
    // literally what POST /api/blocks does with a text-bearing payload.
    const strict = privateNotesDataSchema.strict().safeParse({ text: [{ text: "hello" }] });
    expect(strict.success).toBe(false);
  });

  it("rejects a per-instance visibility toggle", () => {
    expect(privateNotesDataSchema.strict().safeParse({ visibleTo: "agent" }).success).toBe(
      false,
    );
  });

  it("parses to exactly {}", () => {
    expect(privateNotesDataSchema.parse({})).toEqual({});
    expect(privateNotesBlock.empty?.()).toEqual({});
  });
});

describe("privateNotesBlock (derived + forced facts)", () => {
  it("derives acceptsText === false and no text lens from the void schema", () => {
    expect(privateNotesBlock.acceptsText).toBe(false);
    expect(privateNotesBlock.text).toBeUndefined();
  });

  it("is a container: the three facts come from `defineContainerBlock`", () => {
    expect(privateNotesBlock.anchor).toBe(true);
    expect(privateNotesBlock.wrapOnConvert).toBe(true);
    expect(privateNotesBlock.collapsible).toBe("never");
    expect(privateNotesBlock.splitChildWhenExpanded).toBeUndefined();
  });

  it("serializes to the marker alone — a void container has no text of its own", () => {
    expect(privateNotesBlock.markdown?.serialize?.({}, { plain: () => "", ordinal: 1 })).toBe(
      "**[Private]**",
    );
  });
});

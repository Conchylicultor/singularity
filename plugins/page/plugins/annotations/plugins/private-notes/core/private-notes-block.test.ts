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

  it("is a container: the facts come from `defineContainerBlock`", () => {
    expect(privateNotesBlock.anchor).toBe(true);
    expect(privateNotesBlock.wrapOnConvert).toBe(true);
    // Foldable: no `collapsible` opt-out. A container folds to its BORROWED
    // line, which always paints and always carries the chevron back out, so
    // the flag that used to make `expanded` inert is retired.
    expect(privateNotesBlock.collapsible).toBeUndefined();
    expect(privateNotesBlock.splitChildWhenExpanded).toBeUndefined();
  });

  it("maps to a round-tripping <private-notes> tag, not a one-way marker", () => {
    // A void container has no text of its own, so its markdown mapping is the
    // generic TAG: the children go inside it and it comes back as a container.
    // The retired `**[…]**` marker could only ever go one way.
    expect(privateNotesBlock.markdown?.serialize).toBeUndefined();
    expect(privateNotesBlock.markdown?.tag).toEqual({ body: "children" });
  });
});

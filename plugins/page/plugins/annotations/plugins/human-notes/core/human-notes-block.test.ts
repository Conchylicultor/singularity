import { describe, expect, it } from "bun:test";
import { humanNotesBlock, humanNotesDataSchema } from "./human-notes-block";

/**
 * The human card owns NOTHING but its type. These cases pin the void payload
 * at the write boundary — the previous model stored `{ text }` (its title), and a
 * regression that re-adds any field is what would fuse container identity back
 * onto a line of content.
 */
describe("humanNotesDataSchema (void)", () => {
  it("rejects a `text` key at the write boundary", () => {
    // `parse-block-data.ts` parses through `handle.schema.strict()`, so this is
    // literally what POST /api/blocks does with a legacy text-bearing payload.
    const strict = humanNotesDataSchema
      .strict()
      .safeParse({ text: [{ text: "hello" }] });
    expect(strict.success).toBe(false);
  });

  it("parses to exactly {}", () => {
    expect(humanNotesDataSchema.parse({})).toEqual({});
    expect(humanNotesBlock.empty?.()).toEqual({});
  });
});

describe("humanNotesBlock (derived + forced facts)", () => {
  it("derives acceptsText === false and no text lens from the void schema", () => {
    expect(humanNotesBlock.acceptsText).toBe(false);
    expect(humanNotesBlock.text).toBeUndefined();
  });

  it("declares the agent audience — the card exists to be read by one", () => {
    // Required by `defineAnnotationBlock`, so an annotation can never be
    // unmarked; a consumer filters the family on this field and never on a type
    // name.
    expect(humanNotesBlock.audience).toBe("agent");
  });

  it("declares the HUMAN author — an agent reads this card and never writes it", () => {
    // The pair is the whole point of this card: agent-audience says an agent
    // receives it, human-author says the same agent may not touch it. Before
    // `author` existed the second half was only accidentally true — a `/context`
    // card nested inside an `<agent-note>` was rewritable by the next
    // `write_agent_note`, because the write walk stopped at the first row that
    // said YES and this row said nothing.
    expect(humanNotesBlock.author).toBe("human");
  });

  it("is a container: the facts come from `defineContainerBlock`", () => {
    expect(humanNotesBlock.anchor).toBe(true);
    expect(humanNotesBlock.wrapOnConvert).toBe(true);
    // Foldable: no `collapsible` opt-out. A human card holds standing
    // instructions a reader usually wants out of the way, so this is the point.
    expect(humanNotesBlock.collapsible).toBeUndefined();
    // The seam whose `expanded` gate made Enter in the old title row mint a
    // SECOND card.
    expect(humanNotesBlock.splitChildWhenExpanded).toBeUndefined();
  });

  it("keeps the STORED type `context` while the card is named human", () => {
    // The rename is directory / symbol / label / chip / tag only. The type is
    // what page rows store and what the `Editor.Block` contribution is keyed by
    // (and with it every persisted reorder directive), so renaming it would buy
    // a nicer string with a data migration and a silent loss of user config.
    // `BlockTag.name` exists exactly so the two may differ.
    expect(humanNotesBlock.type).toBe("context");
    expect(humanNotesBlock.markdown?.tag?.name).toBe("human");
    // And the old spelling still finds the card in the `/` palette.
    expect(humanNotesBlock.aliases).toContain("context");
    expect(humanNotesBlock.aliases).toContain("user");
  });

  it("maps to a round-tripping <human> tag, not a one-way marker", () => {
    // A void container has no text of its own, so its markdown mapping is the
    // generic TAG: the children go inside it and it comes back as a container.
    // The retired `**[…]**` marker could only ever go one way.
    expect(humanNotesBlock.markdown?.serialize).toBeUndefined();
    expect(humanNotesBlock.markdown?.tag).toEqual({
      name: "human",
      body: "children",
      identified: true,
    });
  });

  it("carries its ROW id, so an agent can echo the card back EXACTLY", () => {
    // `identified` is what lets an agent rewriting the surrounding `<agent-note>`
    // reproduce this card verbatim: the applier pins the row by its id instead of
    // inferring identity from content, which for a void card is `type ␀ {}` —
    // byte-identical for every human card on the page. Omitting the card plans a
    // delete, which the write policy refuses; the pin is what makes echoing it
    // back checkable rather than a guess by the aligner.
    expect(humanNotesBlock.markdown?.tag?.identified).toBe(true);
    // `identified` reserves `id`, so the payload must not declare one — the
    // factory throws on that collision, and the void schema is what keeps it
    // impossible here.
    expect("id" in humanNotesBlock.schema.shape).toBe(false);
  });
});

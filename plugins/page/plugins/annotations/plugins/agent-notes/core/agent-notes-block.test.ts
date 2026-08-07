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

  it("declares the agent audience — an agent may re-read what it wrote", () => {
    // `audience` answers "may an agent receive this", not "who is the reader":
    // this card is addressed TO the human and is still `"agent"`, because it is
    // the one card an agent WRITES and must be able to see again.
    expect(agentNotesBlock.audience).toBe("agent");
  });

  it("is a container: the facts come from `defineContainerBlock`", () => {
    expect(agentNotesBlock.anchor).toBe(true);
    expect(agentNotesBlock.wrapOnConvert).toBe(true);
    // Foldable: no `collapsible` opt-out. A container folds to its BORROWED
    // line, which always paints and always carries the chevron back out, so
    // the flag that used to make `expanded` inert is retired.
    expect(agentNotesBlock.collapsible).toBeUndefined();
    expect(agentNotesBlock.splitChildWhenExpanded).toBeUndefined();
  });

  it("is typed SINGULAR, and the former plural survives as a menu alias", () => {
    // The type is the markdown tag an agent reads and writes (`<agent-note>`),
    // and one card is one note. The symbol, directory, package and
    // `agent-notes-authors` resource stay plural — they name a feature area.
    expect(agentNotesBlock.type).toBe("agent-note");
    expect(agentNotesBlock.aliases).toContain("agent-notes");
  });

  it("maps to a round-tripping <agent-note> tag, not a one-way marker", () => {
    // A void container has no text of its own, so its markdown mapping is the
    // generic TAG: the children go inside it and it comes back as a container.
    // The retired `**[…]**` marker could only ever go one way.
    expect(agentNotesBlock.markdown?.serialize).toBeUndefined();
    expect(agentNotesBlock.markdown?.tag).toEqual({ body: "children", identified: true });
  });

  it("is ADDRESSABLE: the tag carries the row id, and `data` still carries none", () => {
    // The two halves of the reserved attribute, pinned together because they are
    // only safe together. `identified` puts the row id on the tag as `id`, and
    // the schema must therefore NOT have an `id` field of its own — otherwise
    // the derived attribute projection emits `data.id` under the same name and
    // the row ref and the payload field fight (`resolveTag` throws on it).
    expect(agentNotesBlock.markdown?.tag?.identified).toBe(true);
    expect("id" in agentNotesBlock.schema.shape).toBe(false);
  });
});

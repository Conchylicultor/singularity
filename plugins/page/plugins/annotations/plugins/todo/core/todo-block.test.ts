import { describe, expect, it } from "bun:test";
import { todoBlock, todoDataSchema } from "./todo-block";

/**
 * The TODO card owns NOTHING but its type — in particular no `done` flag: it is
 * a REGION of work, not a checkable item (that is `page/to-do`, which belongs
 * inside it). These cases pin the void payload at the write boundary.
 */
describe("todoDataSchema (void)", () => {
  it("rejects a `text` key at the write boundary", () => {
    // `parse-block-data.ts` parses through `handle.schema.strict()`, so this is
    // literally what POST /api/blocks does with a text-bearing payload.
    const strict = todoDataSchema.strict().safeParse({ text: [{ text: "hello" }] });
    expect(strict.success).toBe(false);
  });

  it("rejects a `done` flag — this card is not the checkable item", () => {
    expect(todoDataSchema.strict().safeParse({ done: true }).success).toBe(false);
  });

  it("parses to exactly {}", () => {
    expect(todoDataSchema.parse({})).toEqual({});
    expect(todoBlock.empty?.()).toEqual({});
  });
});

describe("todoBlock (derived + forced facts)", () => {
  it("derives acceptsText === false and no text lens from the void schema", () => {
    expect(todoBlock.acceptsText).toBe(false);
    expect(todoBlock.text).toBeUndefined();
  });

  it("declares the agent audience — outstanding work is FOR an agent", () => {
    // Required by `defineAnnotationBlock`, so an annotation can never be
    // unmarked; a consumer filters the family on this field and never on a type
    // name.
    expect(todoBlock.audience).toBe("agent");
  });

  it("is a container: the facts come from `defineContainerBlock`", () => {
    expect(todoBlock.anchor).toBe(true);
    expect(todoBlock.wrapOnConvert).toBe(true);
    // Foldable: no `collapsible` opt-out. A container folds to its BORROWED
    // line, which always paints and always carries the chevron back out, so
    // the flag that used to make `expanded` inert is retired.
    expect(todoBlock.collapsible).toBeUndefined();
    expect(todoBlock.splitChildWhenExpanded).toBeUndefined();
  });

  it("forwards its typed wrap prefixes through the container factory", () => {
    // The container factory must PASS THESE THROUGH: the markdown-shortcut
    // plugin reads them off the handle, and dropping them (they were once absent
    // from the declaration surface) silently kills the `TODO ` trigger while
    // everything else still works.
    expect(todoBlock.typingPrefixes).toEqual(["TODO ", "TODO: "]);
    // And they are TYPING prefixes, not markdown line syntax: the card's
    // markdown is its `<todo>` tag, so a `TODO ` line in pasted prose is prose.
    expect(todoBlock.markdownPrefixes).toBeUndefined();
  });

  it("maps to a round-tripping <todo> tag, not a one-way marker", () => {
    // A void container has no text of its own, so its markdown mapping is the
    // generic TAG: the children go inside it and it comes back as a container.
    // The retired `**[…]**` marker could only ever go one way.
    expect(todoBlock.markdown?.serialize).toBeUndefined();
    expect(todoBlock.markdown?.tag).toEqual({ body: "children" });
  });
});

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

  it("is a container: the three facts come from `defineContainerBlock`", () => {
    expect(todoBlock.anchor).toBe(true);
    expect(todoBlock.wrapOnConvert).toBe(true);
    expect(todoBlock.collapsible).toBe("never");
    expect(todoBlock.splitChildWhenExpanded).toBeUndefined();
  });

  it("forwards its typed wrap prefixes through the container factory", () => {
    // The container factory must PASS THESE THROUGH: the markdown-shortcut
    // plugin reads them off the handle, and dropping them (they were once absent
    // from the declaration surface) silently kills the `TODO ` trigger while
    // everything else still works.
    expect(todoBlock.markdownPrefixes).toEqual(["TODO ", "TODO: "]);
  });

  it("serializes to the marker alone — a void container has no text of its own", () => {
    expect(todoBlock.markdown?.serialize?.({}, { plain: () => "", ordinal: 1 })).toBe(
      "**[TODO]**",
    );
  });
});

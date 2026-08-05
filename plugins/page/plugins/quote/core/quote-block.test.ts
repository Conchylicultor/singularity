import { describe, expect, it } from "bun:test";
import { quoteBlock, quoteDataSchema } from "./quote-block";

/**
 * A quote owns NOTHING but its type — in particular no `text`: the quoted
 * passage IS its children, which may be paragraphs, a list, a heading or a code
 * block. These cases pin the void payload at the write boundary, which is what
 * makes the pre-container text-bearing rows unwritable rather than merely
 * unused.
 */
describe("quoteDataSchema (void)", () => {
  it("rejects a `text` key at the write boundary", () => {
    // `parse-block-data.ts` parses through `handle.schema.strict()`, so this is
    // literally what POST /api/blocks does with a text-bearing payload.
    const strict = quoteDataSchema.strict().safeParse({ text: [{ text: "wisdom" }] });
    expect(strict.success).toBe(false);
  });

  it("parses to exactly {}", () => {
    expect(quoteDataSchema.parse({})).toEqual({});
    expect(quoteBlock.empty?.()).toEqual({});
  });
});

describe("quoteBlock (derived + forced facts)", () => {
  it("derives acceptsText === false and no text lens from the void schema", () => {
    expect(quoteBlock.acceptsText).toBe(false);
    expect(quoteBlock.text).toBeUndefined();
  });

  it("is a container: the facts come from `defineContainerBlock`", () => {
    expect(quoteBlock.anchor).toBe(true);
    expect(quoteBlock.wrapOnConvert).toBe(true);
    // Foldable: no `collapsible` opt-out. A container folds to its BORROWED
    // line, which always paints and always carries the chevron back out.
    expect(quoteBlock.collapsible).toBeUndefined();
    expect(quoteBlock.splitChildWhenExpanded).toBeUndefined();
  });

  it("drops the text-block keystroke policies a void row cannot honour", () => {
    // No caret can originate in an anchor row, so these were inert the moment
    // the quote stopped owning a line. Backspace at the start of the FIRST CHILD
    // is the generic `unwrap` rung instead, and Enter in a child is a plain
    // sibling split inside the bar.
    expect(quoteBlock.resetToOnBackspaceAtStart).toBeUndefined();
    expect(quoteBlock.breakOutOnEmptyEnter).toBeUndefined();
  });

  it("forwards its typed wrap prefix through the container factory", () => {
    // The container factory must PASS THIS THROUGH: the markdown-shortcut plugin
    // reads it off the handle, and dropping it silently kills the `| ` trigger
    // while everything else still works.
    expect(quoteBlock.typingPrefixes).toEqual(["| "]);
    // And it is a TYPING prefix, not markdown line syntax: `| ` opens a markdown
    // TABLE ROW, so a pasted table must not arrive as a wall of quotes.
    expect(quoteBlock.markdownPrefixes).toBeUndefined();
  });

  it("maps to a <quote> tag carrying its CHILDREN, not one line of text", () => {
    // `body: "text"` could carry the single line the old text-bearing quote had.
    // A container's whole point is that there may be several, of any type.
    expect(quoteBlock.markdown?.tag).toEqual({ body: "children" });
    expect(quoteBlock.markdown?.serialize).toBeUndefined();
  });
});

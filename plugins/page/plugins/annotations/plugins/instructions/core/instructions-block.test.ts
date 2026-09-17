import { describe, expect, it } from "bun:test";
import {
  parseMarkdownToForest,
  serializeForestToMarkdown,
  type BlockHandle,
  type MarkdownContext,
} from "@plugins/page/plugins/editor/core";
import { humanNotesBlock } from "@plugins/page/plugins/annotations/plugins/human-notes/core";
import {
  instructionsBlock,
  instructionsDataSchema,
} from "./instructions-block";

const handles = [instructionsBlock] as BlockHandle<unknown>[];
const ctx: MarkdownContext = {
  handles,
  protectedSpans: [],
  blankLines: "empty-block",
  emptyBlocks: "pinned",
  softBreaks: "escaped",
};

describe("instructionsDataSchema", () => {
  it("rejects a `text` key at the write boundary — the card is still void", () => {
    expect(
      instructionsDataSchema.strict().safeParse({ text: [{ text: "x" }] })
        .success,
    ).toBe(false);
  });

  it("carries one optional boolean, `global`", () => {
    expect(instructionsDataSchema.parse({})).toEqual({});
    expect(instructionsDataSchema.parse({ global: true })).toEqual({
      global: true,
    });
    expect(instructionsDataSchema.safeParse({ global: "yes" }).success).toBe(
      false,
    );
    expect(instructionsBlock.empty?.()).toEqual({});
  });
});

describe("instructionsBlock (declared + forced facts)", () => {
  it("is addressed to agents and holds the HUMAN's words", () => {
    expect(instructionsBlock.audience).toBe("agent");
    expect(instructionsBlock.author).toBe("human");
  });

  it("is a container", () => {
    expect(instructionsBlock.anchor).toBe(true);
    expect(instructionsBlock.wrapOnConvert).toBe(true);
    expect(instructionsBlock.acceptsText).toBe(false);
  });

  it("owns the instruction words in the palette; `/human` no longer answers to them", () => {
    expect(instructionsBlock.type).toBe("instructions");
    expect(instructionsBlock.label).toBe("Instructions");
    for (const word of ["rules", "guidance", "conventions"]) {
      expect(instructionsBlock.aliases).toContain(word);
      expect(humanNotesBlock.aliases).not.toContain(word);
    }
    expect(humanNotesBlock.aliases).not.toContain("instructions");
  });

  it("carries its row id, and does not declare an `id` field of its own", () => {
    expect(instructionsBlock.markdown?.tag?.identified).toBe(true);
    expect("id" in instructionsBlock.schema.shape).toBe(false);
  });
});

describe("<instructions> markdown", () => {
  const node = (data: unknown) => ({
    id: "block-i1",
    type: "instructions",
    data,
    expanded: true,
    children: [],
  });

  it("emits `global` as a plain attribute, only when true", () => {
    expect(serializeForestToMarkdown([node({})], ctx)).toBe(
      '<instructions id="block-i1"/>',
    );
    expect(serializeForestToMarkdown([node({ global: false })], ctx)).toBe(
      '<instructions id="block-i1"/>',
    );
    expect(serializeForestToMarkdown([node({ global: true })], ctx)).toBe(
      '<instructions id="block-i1" global="true"/>',
    );
  });

  it("round-trips `global` and the row id", () => {
    const [parsed] = parseMarkdownToForest(
      '<instructions id="block-i1" global="true"/>',
      ctx,
    );
    expect(parsed).toMatchObject({
      type: "instructions",
      data: { global: true },
      ref: "block-i1",
    });
  });

  it("refuses an attribute it does not declare, and a non-boolean global", () => {
    expect(() =>
      parseMarkdownToForest('<instructions color="red"/>', ctx),
    ).toThrow(/takes only `id` and `global`/);
    expect(() =>
      parseMarkdownToForest('<instructions global="yes"/>', ctx),
    ).toThrow(/`global` is "true" or absent/);
  });
});

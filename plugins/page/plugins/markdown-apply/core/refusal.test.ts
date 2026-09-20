import { describe, expect, test } from "bun:test";
import type { Block } from "@plugins/page/plugins/editor/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { MarkdownApplyPlan, MarkdownTextEdit } from "./plan";
import { roundTripCreatesRefusal } from "./refusal";
import type { StoredRow } from "./stored-row";

// The identity plan is built by hand rather than planned from a document: the
// message is a pure function of (root, page, rows, plan), and a fixture that
// went through the planner would hide which half of the evidence is under test
// behind a markdown document that happens to round-trip badly. The plans here
// are the ones the engine really produced on 2026-09-20 (see
// `research/2026-09-20-page-markdown-line-claim-escape.md`).

const ROOT = "block-cc11355f";
const PAGE = "page-b0dd";

/** The two paragraphs whose text begins `3. ` and `2. `. */
const LIST_LIKE = [
  {
    id: "block-183b07f2",
    text: "3. Investigate the gaps to make it useable. Package it, dogfood it.",
  },
  { id: "block-3d152d33", text: "2. User journey for the git clone user" },
] as const;

function row(id: string, text: string): StoredRow {
  return {
    id,
    parentId: PAGE,
    type: "text",
    data: { text },
    rank: "a0",
    expanded: true,
  };
}

function create(type: string, i: number): Block {
  const at = new Date("2026-09-20T00:00:00.000Z");
  return {
    id: `created-${type}-${i}`,
    pageId: PAGE,
    parentId: PAGE,
    type,
    data: { text: "" },
    rank: Rank.from("a0"),
    expanded: true,
    createdAt: at,
    updatedAt: at,
  };
}

function creates(...spec: [type: string, count: number][]): Block[] {
  return spec.flatMap(([type, count]) =>
    Array.from({ length: count }, (_, i) => create(type, i)),
  );
}

function refusal(parts: {
  rows: StoredRow[];
  creates: Block[];
  deleteIds?: string[];
  textEdits?: string[];
}): string {
  const identity: MarkdownApplyPlan = {
    patch: {
      creates: parts.creates,
      updates: [],
      deleteIds: parts.deleteIds ?? [],
    },
    textEdits: (parts.textEdits ?? []).map(
      (blockId): MarkdownTextEdit => ({ blockId, runs: [] }),
    ),
    stats: {
      survived: 0,
      created: parts.creates.length,
      deleted: parts.deleteIds?.length ?? 0,
      moved: 0,
    },
  };
  return roundTripCreatesRefusal({
    rootId: ROOT,
    pageId: PAGE,
    rows: parts.rows,
    identity,
  });
}

/** The refusal's framing, identical whatever evidence the plan carries. */
const OPENING =
  `markdown apply: block ${ROOT} on page ${PAGE} cannot be edited right now. ` +
  `Reading it out and applying it back completely unchanged would itself ` +
  `create 2 blocks, so there is no way to tell this edit apart from the round ` +
  `trip's own damage.`;
const ENDING =
  `This is a bug in the page's markdown projection, not in the edit — report ` +
  `it rather than working around it.`;

describe("roundTripCreatesRefusal", () => {
  test("names the rows the round trip would DROP, and what it creates instead", () => {
    // The real 2026-09-20 case: two paragraphs re-read as numbered lists, so
    // the plan deletes two rows, creates two, and edits NO text at all. The
    // refusal that only listed text edits named nothing here.
    const message = refusal({
      rows: LIST_LIKE.map((r) => row(r.id, r.text)),
      creates: creates(["numbered-list", 2]),
      deleteIds: LIST_LIKE.map((r) => r.id),
    });

    expect(message).toBe(
      `${OPENING} The round trip would drop 2 stored rows outright and create ` +
        `2 numbered-list blocks instead, so the loss is in those rows: ` +
        `block-183b07f2 ("3. Investigate the gaps to make it useable. Package ` +
        `it, dogf…"), block-3d152d33 ("2. User journey for the git clone ` +
        `user"). ${ENDING}`,
    );
    // The dead end this arm was written to remove: with no text edit to name,
    // the message used to send its reader after "the shape the read emitted".
    expect(message).not.toContain("No stored row's text would be rewritten");
  });

  test("a single dropped row reads in the singular", () => {
    const message = refusal({
      rows: [row(LIST_LIKE[1].id, LIST_LIKE[1].text)],
      creates: creates(["numbered-list", 1]),
      deleteIds: [LIST_LIKE[1].id],
    });

    expect(message).toContain(
      `The round trip would drop stored row block-3d152d33 ("2. User journey ` +
        `for the git clone user") outright and create 1 numbered-list block ` +
        `instead, so that row is where the loss is.`,
    );
  });

  test("text edits and no deletes keep the fan-out wording", () => {
    // The soft-line-break class (`research/2026-09-10-…`): one stored block
    // fans out into several document lines, so its text is rewritten down to
    // one of them and the list is a superset containing it.
    const message = refusal({
      rows: LIST_LIKE.map((r) => row(r.id, r.text)),
      creates: creates(["text", 2]),
      textEdits: LIST_LIKE.map((r) => r.id),
    });

    expect(message).toContain(
      `The rows whose stored text the round trip would rewrite are ` +
        `block-183b07f2 ("3. Investigate the gaps to make it useable. Package ` +
        `it, dogf…"), block-3d152d33 ("2. User journey for the git clone ` +
        `user"); the block that fans out into several lines is one of them.`,
    );
    expect(message).not.toContain("drop");
  });

  test("one text edit and no deletes reads in the singular", () => {
    const message = refusal({
      rows: [row(LIST_LIKE[1].id, LIST_LIKE[1].text)],
      creates: creates(["text", 1]),
      textEdits: [LIST_LIKE[1].id],
    });

    expect(message).toContain(
      `The row whose stored text the round trip would rewrite is ` +
        `block-3d152d33 ("2. User journey for the git clone user").`,
    );
  });

  test("both lists read as one paragraph, sharpest evidence first", () => {
    const message = refusal({
      rows: LIST_LIKE.map((r) => row(r.id, r.text)),
      creates: creates(["numbered-list", 2]),
      deleteIds: [LIST_LIKE[0].id],
      textEdits: [LIST_LIKE[1].id],
    });

    const dropped =
      `The round trip would drop stored row block-183b07f2 ("3. Investigate ` +
      `the gaps to make it useable. Package it, dogf…") outright and create 2 ` +
      `numbered-list blocks instead, so that row is where the loss is.`;
    const rewritten =
      `It would also rewrite the stored text of block-3d152d33 ("2. User ` +
      `journey for the git clone user") — a wider net than the dropped rows, ` +
      `since every row the round trip merely re-canonicalizes is in it too.`;
    expect(message).toBe(`${OPENING} ${dropped} ${rewritten} ${ENDING}`);
    // The delete is the row that stops existing; the rewrites are the superset
    // around it. A reader relaying this reads the sharp fact first.
    expect(message.indexOf(dropped)).toBeLessThan(message.indexOf(rewritten));
  });

  test("neither list: the message says the loss is in the document's shape", () => {
    const message = refusal({
      rows: [],
      creates: creates(["text", 2]),
    });

    expect(message).toBe(
      `${OPENING} No stored row's text would be rewritten, so the loss is in ` +
        `the shape the read emitted rather than in one block's text. ${ENDING}`,
    );
  });

  test("a long list stops at five rows and counts the rest", () => {
    const dropped = Array.from({ length: 7 }, (_, i) => `block-${i}`);
    const message = refusal({
      rows: dropped.map((id) => row(id, `paragraph ${id}`)),
      creates: creates(["numbered-list", 7]),
      deleteIds: dropped,
    });

    expect(message).toContain(
      `block-0 ("paragraph block-0"), block-1 ("paragraph block-1"), ` +
        `block-2 ("paragraph block-2"), block-3 ("paragraph block-3"), ` +
        `block-4 ("paragraph block-4"), and 2 more.`,
    );
    expect(message).not.toContain("block-5");
    expect(message).not.toContain("block-6");
  });

  test("the replacements are counted per type, most numerous first", () => {
    const message = refusal({
      rows: [row(LIST_LIKE[0].id, LIST_LIKE[0].text)],
      creates: creates(["text", 1], ["numbered-list", 2], ["heading-1", 1]),
      deleteIds: [LIST_LIKE[0].id],
    });

    // Never a pairing: one dropped row, four created blocks, and no claim that
    // any one of them stands for it.
    expect(message).toContain(
      `create 2 numbered-list blocks, 1 heading-1 block, 1 text block instead`,
    );
  });

  test("a newline in a dropped row's text is shown as \\n, not as a break", () => {
    const message = refusal({
      rows: [row("block-soft", "first line\nsecond line")],
      creates: creates(["text", 2]),
      deleteIds: ["block-soft"],
    });

    expect(message).toContain(`block-soft ("first line\\nsecond line")`);
    expect(message).not.toContain("\n");
  });
});

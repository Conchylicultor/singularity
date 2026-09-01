import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  defineBlock,
  parseMarkdownToForest,
  plainOf,
  serializeForestToMarkdown,
  textDataSchema,
  type Block,
  type BlockHandle,
  type BlockUpdate,
  type MarkdownContext,
  type RichText,
} from "@plugins/page/plugins/editor/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { markdownNodesOfRows } from "./flatten";
import {
  planMarkdownApply,
  type MarkdownApplyPlan,
  type MarkdownTextEdit,
} from "./plan";
import type { StoredRow } from "./stored-row";
import { boundaryViolations, touchedBlocks } from "./touched";

// The boundary predicate here is SYNTHETIC — `type === "fence"`, a type nothing
// in this repo declares. That is the point: these tests prove the MECHANISM, and
// a test written against the real agent-note type would prove the policy while
// quietly letting a hard-coded type name into a module whose whole contract is
// that it names none.
const BOUNDARY_TYPE = "fence";
const isBoundary = (row: { id: string; type: string }): boolean =>
  row.type === BOUNDARY_TYPE;

// Handles are built LOCALLY with the real `defineBlock`, as `plan.test.ts` does
// and for its reason: importing a block plugin back into a core test would form
// a plugin import cycle the boundary checker rejects.

const text = defineBlock({
  type: "text",
  schema: textDataSchema,
  defaultText: true,
  empty: () => ({ text: [] }),
  // Mirrors `page/text`: an empty paragraph is a blank line, and the tag stays
  // parse-only so `<text/>` written before that dialect still comes back.
  markdown: {
    serialize: (d, ctx) => (plainOf(d.text).length === 0 ? "" : ctx.md(d.text)),
    tag: { name: "text", body: "none", parseAttrs: () => ({ text: [] }) },
  },
});

/**
 * A void, IDENTIFIED container — the shape the boundary predicate is about. It
 * round-trips its row id as the reserved `id` attribute, which is what makes the
 * T3 attack below expressible in markdown at all: without a pin the card itself
 * would be a delete-plus-create and the "moved into it" question would not arise.
 */
const fence = defineBlock({
  type: BOUNDARY_TYPE,
  schema: z.object({}),
  empty: () => ({}),
  anchor: true,
  markdown: { tag: { body: "children", identified: true } },
}) as BlockHandle<unknown>;

const handles: BlockHandle<unknown>[] = [text, fence] as BlockHandle<unknown>[];
const ctx: MarkdownContext = {
  handles,
  protectedSpans: [],
  // The server dialect: this module's documents are ones this codebase emitted.
  blankLines: "empty-block",
};

const PAGE_ID = "PAGE";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface RawNode {
  type: string;
  data: unknown;
  children: RawNode[];
}

const raw = (
  type: string,
  data: unknown,
  children: RawNode[] = [],
): RawNode => ({
  type,
  data,
  children,
});
const runs = (s: string): RichText => (s ? [{ text: s }] : []);
const line = (s: string): RawNode => raw("text", { text: runs(s) });

/** Ids in DFS order (`b1`, `b2`, …); ranks minted per sibling list. */
function rowsOf(forest: RawNode[]): StoredRow[] {
  const rows: StoredRow[] = [];
  let n = 0;
  const walk = (nodes: RawNode[], parentId: string): void => {
    const ranks = Rank.nBetween(null, null, nodes.length);
    nodes.forEach((node, i) => {
      const id = `b${++n}`;
      rows.push({
        id,
        parentId,
        type: node.type,
        data: node.data,
        rank: ranks[i]!.toJSON(),
        expanded: true,
      });
      walk(node.children, id);
    });
  };
  walk(forest, PAGE_ID);
  return rows;
}

/**
 * The fixture every hand-built plan below is judged against:
 *
 * ```
 * PAGE
 *  ├ b1  text   "prose"        ← the document's own body
 *  ├ b2  fence                 ← a boundary
 *  │  └ b3 text  "noted"
 *  └ b4  fence                 ← a second boundary
 *     └ b5 text  "also noted"
 * ```
 */
const fixture = (): StoredRow[] =>
  rowsOf([
    line("prose"),
    raw(BOUNDARY_TYPE, {}, [line("noted")]),
    raw(BOUNDARY_TYPE, {}, [line("also noted")]),
  ]);

const NOW = new Date("2026-08-07T00:00:00.000Z");

/** A created row, as `planMarkdownApply` mints one. */
const create = (id: string, parentId: string, type: string): Block => ({
  id,
  pageId: PAGE_ID,
  parentId,
  type,
  data: type === "text" ? { text: runs(id) } : {},
  rank: Rank.between(null, null),
  expanded: true,
  createdAt: NOW,
  updatedAt: NOW,
});

/**
 * A plan, hand-built. The predicate reads a plan and rows and nothing else, so
 * stating the patch directly is the most direct statement of each case — the one
 * case that must go through the real planner (T3) does, at the top.
 */
function planOf(patch: {
  creates?: Block[];
  updates?: BlockUpdate[];
  deleteIds?: string[];
  textEdits?: MarkdownTextEdit[];
}): MarkdownApplyPlan {
  return {
    patch: {
      creates: patch.creates ?? [],
      updates: patch.updates ?? [],
      deleteIds: patch.deleteIds ?? [],
    },
    textEdits: patch.textEdits ?? [],
    stats: { survived: 0, created: 0, deleted: 0, moved: 0 },
  };
}

const violationsOf = (
  plan: MarkdownApplyPlan,
  existing: readonly StoredRow[] = fixture(),
  rootId = PAGE_ID,
) => boundaryViolations({ plan, existing, rootId, isBoundary });

// ---------------------------------------------------------------------------
// T3 — the both-chains rule, through the REAL planner
// ---------------------------------------------------------------------------
//
// Reachability is half the claim, so this one case is not hand-built: the attack
// only matters because the aligner MATCHES byte-identical prose and preserves its
// row id, so it arrives as an `update` naming `parentId` rather than as a delete
// plus a create. A hand-built patch would assert the predicate while assuming the
// very thing that makes the predicate necessary.

describe("T3: annexing the document's prose into a boundary", () => {
  const rows = (): StoredRow[] =>
    rowsOf([
      line("The parser handles UTF-8."),
      raw(BOUNDARY_TYPE, {}, [line("Checked the writer.")]),
    ]);

  // b1 = the prose, b2 = the card, b3 = the card's own line.
  const attack = [
    `<${BOUNDARY_TYPE} id="b2">`,
    "  The parser handles UTF-8.",
    "  Checked the writer.",
    `</${BOUNDARY_TYPE}>`,
  ].join("\n");

  const planAttack = (existing: StoredRow[]): MarkdownApplyPlan => {
    const result = planMarkdownApply({
      rootId: PAGE_ID,
      pageId: PAGE_ID,
      existing,
      incoming: parseMarkdownToForest(attack, ctx),
      handles,
    });
    if (!result.ok)
      throw new Error(`refused: ${result.reason} — ${result.detail}`);
    return result.plan;
  };

  test("the planner really does emit it as a MOVE, not a delete+create", () => {
    const existing = rows();
    const plan = planAttack(existing);
    // Nothing is deleted and nothing is minted: b1 keeps its id (and therefore
    // its content doc, its links, its authorship) and simply changes parent.
    expect(plan.patch.creates).toEqual([]);
    expect(plan.patch.deleteIds).toEqual([]);
    expect(
      plan.patch.updates.find((u) => u.id === "b1")?.changes.parentId,
    ).toBe("b2");
    expect(touchedBlocks(plan).updated).toContain("b1");
  });

  test("and it is caught, as `escaped-origin`", () => {
    const existing = rows();
    expect(violationsOf(planAttack(existing), existing)).toEqual([
      { blockId: "b1", how: "updated", reason: "escaped-origin" },
    ]);
  });

  test("the same document, applied to the forest it describes, is clean", () => {
    // Idempotence: re-applying what the attack produced touches nothing that is
    // not already inside the card, so the predicate must not re-flag it. This is
    // what proves `escaped-origin` names the MOVE and not the destination.
    const existing = rows();
    const moved = existing.map((row) =>
      row.id === "b1"
        ? { ...row, parentId: "b2", rank: Rank.between(null, null).toJSON() }
        : row,
    );
    expect(violationsOf(planAttack(moved), moved)).toEqual([]);
  });

  test("the document a faithful read produces plans no violation at all", () => {
    const existing = rows();
    const faithful = serializeForestToMarkdown(
      markdownNodesOfRows(existing, PAGE_ID),
      ctx,
    );
    const result = planMarkdownApply({
      rootId: PAGE_ID,
      pageId: PAGE_ID,
      existing,
      incoming: parseMarkdownToForest(faithful, ctx),
      handles,
    });
    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    expect(violationsOf(result.plan, existing)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The accepted loss: an empty paragraph a blank line cannot place
// ---------------------------------------------------------------------------
//
// An empty paragraph is a BLANK LINE, and a blank line carries no indentation of
// its own — so it comes back at the depth of the block that FOLLOWS it. When
// that block is shallower, the round trip is a real move the writer never made,
// and `parentId` is a judged field, so a faithful read applied straight back is
// REFUSED on a block the edit never mentioned. Designed behaviour rather than a
// defect (`research/2026-09-01-page-blank-line-empty-paragraph.md`), pinned here
// so it stays a known outcome instead of a rediscovered surprise.

describe("an empty paragraph the blank-line dialect cannot place", () => {
  // PAGE ├ b1 text "prose" ─ b2 text ""   ← empty, b1's last child
  //      └ b3 fence        ─ b4 text "noted"
  const rows = (): StoredRow[] =>
    rowsOf([
      raw("text", { text: runs("prose") }, [line("")]),
      raw(BOUNDARY_TYPE, {}, [line("noted")]),
    ]);

  /** Read the forest out and apply it straight back — an edit that changes nothing. */
  const noOpApply = (existing: StoredRow[]): MarkdownApplyPlan => {
    const md = serializeForestToMarkdown(
      markdownNodesOfRows(existing, PAGE_ID),
      ctx,
    );
    const result = planMarkdownApply({
      rootId: PAGE_ID,
      pageId: PAGE_ID,
      existing,
      incoming: parseMarkdownToForest(md, ctx),
      handles,
    });
    if (!result.ok)
      throw new Error(`refused: ${result.reason} — ${result.detail}`);
    return result.plan;
  };

  test("the read emits the empty paragraph as a bare blank line", () => {
    expect(
      serializeForestToMarkdown(markdownNodesOfRows(rows(), PAGE_ID), ctx),
    ).toBe(
      [
        "prose",
        "",
        `<${BOUNDARY_TYPE} id="b3">`,
        "  noted",
        `</${BOUNDARY_TYPE}>`,
      ].join("\n"),
    );
  });

  test("applying it straight back is a `parentId` update on the empty block", () => {
    const plan = noOpApply(rows());
    // The ROW survives — an empty paragraph owns no text, no attachments, no
    // links — so the loss is its parent, never its id.
    expect(plan.patch.creates).toEqual([]);
    expect(plan.patch.deleteIds).toEqual([]);
    expect(
      plan.patch.updates.find((u) => u.id === "b2")?.changes.parentId,
    ).toBe(PAGE_ID);
  });

  test("and under boundary enforcement that move refuses the whole apply", () => {
    const existing = rows();
    expect(violationsOf(noOpApply(existing), existing)).toEqual([
      { blockId: "b2", how: "updated", reason: "escaped" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// The chain rule, per `how`
// ---------------------------------------------------------------------------

describe("moves", () => {
  test("out of a boundary onto the page body is `escaped`", () => {
    const plan = planOf({
      updates: [{ id: "b3", changes: { parentId: PAGE_ID } }],
    });
    expect(violationsOf(plan)).toEqual([
      { blockId: "b3", how: "updated", reason: "escaped" },
    ]);
  });

  test("between two boundaries is legal", () => {
    // Both chains reach A boundary — not the same one, deliberately. The rule is
    // about being inside the caller's set, not about staying in one card.
    const plan = planOf({
      updates: [{ id: "b3", changes: { parentId: "b4" } }],
    });
    expect(violationsOf(plan)).toEqual([]);
  });

  test("a whole subtree cannot be laundered through its parent", () => {
    // b3 is edited AND its parent card is moved out to the page in one plan. The
    // old chain is resolved against the PRE-plan forest, so moving the ancestor
    // cannot retroactively make b3's origin look like open body — nor its
    // destination look like a card.
    const plan = planOf({
      updates: [
        { id: "b2", changes: { parentId: PAGE_ID } },
        { id: "b3", changes: { data: { text: runs("edited") } } },
      ],
    });
    expect(violationsOf(plan)).toEqual([]);
  });
});

describe("T4: field granularity", () => {
  // Minting a card at page level re-ranks its prose siblings, so this update is
  // what the feature's MAIN use looks like. A predicate that refuses it refuses
  // the feature.
  test("a rank-only update to page prose is NOT a violation", () => {
    const plan = planOf({
      creates: [create("new", PAGE_ID, BOUNDARY_TYPE)],
      updates: [{ id: "b1", changes: { rank: Rank.between(null, null) } }],
    });
    expect(violationsOf(plan)).toEqual([]);
  });

  test("the SAME row with a `data` change is a violation", () => {
    const plan = planOf({
      updates: [{ id: "b1", changes: { data: { text: runs("rewritten") } } }],
    });
    expect(violationsOf(plan)).toEqual([
      { blockId: "b1", how: "updated", reason: "escaped" },
    ]);
  });

  test("`type` and `parentId` are judged too — both as `escaped-origin`", () => {
    // Two shapes of the same annexation. `parentId` moves the prose INTO the
    // card (T3 proper); `type` retypes the prose row into a boundary, so its NEW
    // chain trivially passes (a boundary is inside itself) while the row it came
    // from was open body. Both are only caught by the old chain.
    for (const changes of [{ type: BOUNDARY_TYPE }, { parentId: "b2" }]) {
      expect(
        violationsOf(planOf({ updates: [{ id: "b1", changes }] })),
      ).toEqual([{ blockId: "b1", how: "updated", reason: "escaped-origin" }]);
    }
  });

  test("a rank change RIDING a judged field is still judged", () => {
    const plan = planOf({
      updates: [
        {
          id: "b1",
          changes: {
            rank: Rank.between(null, null),
            data: { text: runs("x") },
          },
        },
      ],
    });
    expect(violationsOf(plan)).toHaveLength(1);
  });

  test("`touchedBlocks` still reports a rank-only update as a write", () => {
    const plan = planOf({
      updates: [{ id: "b1", changes: { rank: Rank.between(null, null) } }],
    });
    expect(touchedBlocks(plan).updated).toEqual(["b1"]);
  });
});

describe("creates", () => {
  test("inside an EXISTING boundary is legal", () => {
    expect(
      violationsOf(planOf({ creates: [create("n", "b2", "text")] })),
    ).toEqual([]);
  });

  test("a created boundary satisfies its own check, and hosts its own children", () => {
    const plan = planOf({
      creates: [
        create("card", PAGE_ID, BOUNDARY_TYPE),
        create("n", "card", "text"),
      ],
    });
    expect(violationsOf(plan)).toEqual([]);
  });

  test("outside every boundary is a violation", () => {
    expect(
      violationsOf(planOf({ creates: [create("n", PAGE_ID, "text")] })),
    ).toEqual([{ blockId: "n", how: "created", reason: "escaped" }]);
  });

  test("a create is judged on its NEW chain only — it has no old one", () => {
    // A created id is in neither the before-maps nor `existing`, so an
    // implementation that walked the old chain for creates would report every
    // legal one as `escaped-origin`.
    const plan = planOf({ creates: [create("n", "b2", "text")] });
    expect(violationsOf(plan).map((v) => v.reason)).toEqual([]);
  });
});

describe("deletes", () => {
  test("from inside a boundary is legal", () => {
    expect(violationsOf(planOf({ deleteIds: ["b3"] }))).toEqual([]);
  });

  test("from the page body is a violation", () => {
    expect(violationsOf(planOf({ deleteIds: ["b1"] }))).toEqual([
      { blockId: "b1", how: "deleted", reason: "escaped" },
    ]);
  });

  test("deleting the boundary itself is legal — it is inside itself", () => {
    expect(violationsOf(planOf({ deleteIds: ["b2", "b3"] }))).toEqual([]);
  });
});

describe("text edits", () => {
  test("inside a boundary is legal", () => {
    expect(
      violationsOf(
        planOf({ textEdits: [{ blockId: "b3", runs: runs("re") }] }),
      ),
    ).toEqual([]);
  });

  test("on the page's own prose is a violation", () => {
    expect(
      violationsOf(
        planOf({ textEdits: [{ blockId: "b1", runs: runs("re") }] }),
      ),
    ).toEqual([{ blockId: "b1", how: "text-edited", reason: "escaped" }]);
  });
});

// ---------------------------------------------------------------------------
// Scope, shape and corruption
// ---------------------------------------------------------------------------

describe("the scope root", () => {
  test("a root that IS a boundary makes everything under it legal", () => {
    // A card-scoped apply: the walk stops at `rootId`, but only AFTER testing it,
    // so the card the apply is rooted at counts as the boundary it is.
    const plan = planOf({
      creates: [create("n", "b2", "text")],
      updates: [{ id: "b3", changes: { data: { text: runs("x") } } }],
      deleteIds: [],
    });
    expect(violationsOf(plan, fixture(), "b2")).toEqual([]);
  });

  test("a non-boundary root does not become one", () => {
    expect(
      violationsOf(planOf({ deleteIds: ["b1"] }), fixture(), PAGE_ID),
    ).toHaveLength(1);
  });
});

describe("touchedBlocks", () => {
  test("reports every channel, in the plan's own order", () => {
    const plan = planOf({
      creates: [create("c1", "b2", "text"), create("c2", "b2", "text")],
      updates: [{ id: "b1", changes: { rank: Rank.between(null, null) } }],
      deleteIds: ["b3"],
      textEdits: [{ blockId: "b5", runs: runs("x") }],
    });
    expect(touchedBlocks(plan)).toEqual({
      created: ["c1", "c2"],
      updated: ["b1"],
      deleted: ["b3"],
      textEdited: ["b5"],
    });
  });

  test("an empty plan touches nothing", () => {
    expect(touchedBlocks(planOf({}))).toEqual({
      created: [],
      updated: [],
      deleted: [],
      textEdited: [],
    });
  });
});

describe("corruption", () => {
  test("a cycle in the parent map THROWS rather than looping", () => {
    const cyclic: StoredRow[] = [
      {
        id: "x",
        parentId: "y",
        type: "text",
        data: {},
        rank: "a0",
        expanded: true,
      },
      {
        id: "y",
        parentId: "x",
        type: "text",
        data: {},
        rank: "a1",
        expanded: true,
      },
    ];
    expect(() => violationsOf(planOf({ deleteIds: ["x"] }), cyclic)).toThrow(
      /does not terminate/,
    );
  });

  test("a chain leaving the partition is `escaped`, not a throw", () => {
    // An unresolvable parent is an ANSWER — the block is not provably inside a
    // boundary — where a chain that never ends is corruption. The two must not
    // collapse into one arm.
    const orphan: StoredRow[] = [
      {
        id: "x",
        parentId: "gone",
        type: "text",
        data: {},
        rank: "a0",
        expanded: true,
      },
    ];
    expect(violationsOf(planOf({ deleteIds: ["x"] }), orphan)).toEqual([
      { blockId: "x", how: "deleted", reason: "escaped" },
    ]);
  });
});

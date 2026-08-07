import { beforeEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import { collectContributions } from "@plugins/framework/plugins/server-core/core";
import { Editor, type StoredBlock } from "@plugins/page/plugins/editor/server";
import type { Block, BlockUpdate } from "@plugins/page/plugins/editor/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { defineAnnotationBlock } from "@plugins/page/plugins/annotations/core";
import { textBlock } from "@plugins/page/plugins/text/core";
import { agentNotesBlock } from "@plugins/page/plugins/annotations/plugins/agent-notes/core";
import type {
  MarkdownApplyPlan,
  MarkdownTextEdit,
} from "@plugins/page/plugins/markdown-apply/core";
import type { BlockScope } from "@plugins/page/plugins/markdown-apply/server";
import {
  assertAgentAddressable,
  assertNoteCard,
  assertNotesOnlyPlan,
  redactHumanAudience,
} from "./policy";

/**
 * The policy rules, over a fixture forest and hand-built plans.
 *
 * The annotation handles are THROWAWAY, registered through the real
 * `defineAnnotationBlock` — the point being that nothing here names a concrete
 * plugin's type: the rules enumerate `audience === "human"` off the registry, so
 * a type invented in this file is treated exactly like `/private`. A test that
 * seeded the real four would prove the rules work for the four we have, which is
 * the weaker claim.
 *
 * `agent-note` is the one exception, on both sides: rules 3 and 4 are ABOUT that
 * type, so the fixture uses its real id.
 */
const privateish = defineAnnotationBlock({
  type: "zz-withheld",
  schema: z.object({}),
  audience: "human",
  markdown: { tag: { body: "children" } },
});
const contextish = defineAnnotationBlock({
  type: "zz-shared",
  schema: z.object({}),
  audience: "agent",
  markdown: { tag: { body: "children" } },
});

beforeEach(() => {
  collectContributions([
    {
      id: "agent-access-policy-fixture",
      contributions: [
        Editor.BlockData(privateish),
        Editor.BlockData(contextish),
        Editor.BlockData(textBlock),
        Editor.BlockData(agentNotesBlock),
      ],
    },
  ]);
});

/**
 * ```
 * page
 * ├── prose
 * ├── withheld            (audience: human)
 * │   └── secret
 * │       └── deeper
 * ├── shared              (audience: agent)
 * │   └── open
 * ├── notes               (agent-note)
 * │   └── note-line
 * └── tainted             (agent-note, holding a withheld card — the drag case)
 *     └── smuggled        (audience: human)
 * ```
 */
const PAGE = "page";
let rank = 0;
function row(id: string, parentId: string, type: string): StoredBlock {
  rank += 1;
  return { id, parentId, type, data: {}, rank: `a${rank}`, expanded: true };
}
const scope: BlockScope = {
  pageId: PAGE,
  // Carried by the scope for the page-title banner (`markdown-apply`'s
  // `core/page-title.ts`); nothing this policy asserts on reads it.
  title: "Test page",
  rows: [
    row("prose", PAGE, "text"),
    row("withheld", PAGE, privateish.type),
    row("secret", "withheld", "text"),
    row("deeper", "secret", "text"),
    row("shared", PAGE, contextish.type),
    row("open", "shared", "text"),
    row("notes", PAGE, agentNotesBlock.type),
    row("note-line", "notes", "text"),
    row("tainted", PAGE, agentNotesBlock.type),
    row("smuggled", "tainted", privateish.type),
  ],
};

describe("redactHumanAudience (rule 1)", () => {
  test("drops human-audience rows and nothing else", () => {
    const kept = redactHumanAudience(scope.rows).map((r) => r.id);
    expect(kept).not.toContain("withheld");
    expect(kept).not.toContain("smuggled");
    // The DESCENDANTS are still in the filtered array — pruning them is the
    // engine's walk, which never reaches a child whose parent is gone. A filter
    // that also removed them would be a second, drifting implementation of the
    // same rule.
    expect(kept).toContain("secret");
    expect(kept).toContain("prose");
    expect(kept).toContain("shared");
  });

  test("an agent-audience annotation is ordinary content to it", () => {
    expect(redactHumanAudience(scope.rows).map((r) => r.id)).toContain("open");
  });

  test("is generic in the row type — ONE function serves the read and the apply", () => {
    // `ReadBlockOptions.redact` and `ApplyBlockOptions.redact` want different row
    // types; a second copy typed for the write is exactly the drift that would
    // make an apply diff against a document nobody saw. Compiling against a row
    // shape that is not `StoredBlock` is the assertion.
    const lean: { id: string; type: string }[] = [
      { id: "a", type: "text" },
      { id: "b", type: privateish.type },
    ];
    expect(redactHumanAudience(lean).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("assertAgentAddressable (rule 2)", () => {
  test("allows the page, ordinary prose, and an agent-audience card's contents", () => {
    for (const id of [PAGE, "prose", "shared", "open", "notes", "note-line"]) {
      expect(() => {
        assertAgentAddressable(scope, id);
      }).not.toThrow();
    }
  });

  test("refuses the withheld card itself", () => {
    expect(() => {
      assertAgentAddressable(scope, "withheld");
    }).toThrow(/withheld from agents/);
  });

  test("refuses a block INSIDE it, at any depth — the id is not a bypass", () => {
    // Without this, redaction answers the read: the walk starts at a root the
    // filter removed, so it reaches nothing and the empty document reads as
    // "this block has no content".
    for (const id of ["secret", "deeper"]) {
      expect(() => {
        assertAgentAddressable(scope, id);
      }).toThrow(/withheld from agents/);
    }
  });
});

describe("assertNoteCard (rule 3 — write_agent_note's door)", () => {
  test("accepts an agent-note card", () => {
    expect(() => {
      assertNoteCard(scope, "notes");
    }).not.toThrow();
  });

  test("refuses prose, an agent-audience card, and the page — naming edit_page", () => {
    for (const id of ["prose", "note-line", "shared", PAGE]) {
      expect(() => {
        assertNoteCard(scope, id);
      }).toThrow(/is not an "agent-note" card|is the page itself, not an "agent-note"/);
    }
    // The primary error is a page id sent to Write, so its message points at the
    // tool that does take one — not at the deleted append tool.
    expect(() => {
      assertNoteCard(scope, PAGE);
    }).toThrow(/edit_page/);
  });

  test("refuses an agent-note card that sits inside a withheld one", () => {
    const nested: BlockScope = {
      pageId: PAGE,
      title: scope.title,
      rows: [...scope.rows, row("buried", "withheld", agentNotesBlock.type)],
    };
    expect(() => {
      assertNoteCard(nested, "buried");
    }).toThrow(/withheld from agents/);
  });

  test("ACCEPTS a card holding withheld content — the retired rule 4", () => {
    // This used to be a refusal, because the write diffed against the FULL stored
    // forest while the read was redacted, so the smuggled card arrived as a
    // deletion. The apply now redacts through the same filter as the read: the
    // card is invisible to the walk AND preserved by it (its `(parent_id, rank)`
    // key stays reserved), so there is nothing left to refuse.
    expect(() => {
      assertNoteCard(scope, "tainted");
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// assertNotesOnlyPlan (rule 4)
// ---------------------------------------------------------------------------

const NOW = new Date("2026-08-07T00:00:00.000Z");

/** A created row, as `planMarkdownApply` mints one. */
const create = (id: string, parentId: string, type: string): Block => ({
  id,
  pageId: PAGE,
  parentId,
  type,
  data: {},
  rank: Rank.between(null, null),
  expanded: true,
  createdAt: NOW,
  updatedAt: NOW,
});

/**
 * A plan, hand-built. The predicate reads a plan and rows and nothing else, so
 * stating the patch directly is the most direct statement of each case — and it
 * is what lets a RETYPED SURVIVOR (the shape a parsed-forest walk could never
 * see) be expressed at all.
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

/** The page-rooted call `edit_page` makes. */
const judgePage = (plan: MarkdownApplyPlan): string[] =>
  assertNotesOnlyPlan({ plan, rows: scope.rows, rootId: PAGE });

describe("assertNotesOnlyPlan — every write inside a card", () => {
  test("accepts writes inside an existing card", () => {
    expect(
      judgePage(
        planOf({
          creates: [create("new-line", "notes", "text")],
          textEdits: [{ blockId: "note-line", runs: [{ text: "revised" }] }],
        }),
      ),
    ).toEqual(["notes"]);
  });

  test("accepts a new card at page level, and reports it as the card to stamp", () => {
    expect(
      judgePage(
        planOf({
          creates: [
            create("fresh", PAGE, agentNotesBlock.type),
            create("fresh-line", "fresh", "text"),
          ],
        }),
      ),
    ).toEqual(["fresh"]);
  });

  test("T4: a rank-only update to prose is exempt — minting a card re-ranks siblings", () => {
    // The carve-out the feature depends on: without it the predicate refuses the
    // ordinary case (a new card beside the prose it annotates).
    const cards = judgePage(
      planOf({
        creates: [create("fresh", PAGE, agentNotesBlock.type)],
        updates: [{ id: "prose", changes: { rank: Rank.between(null, null) } }],
      }),
    );
    expect(cards).toEqual(["fresh"]);
  });

  test("refuses a text edit of prose — the page's own body is read-only", () => {
    expect(() => {
      judgePage(planOf({ textEdits: [{ blockId: "prose", runs: [{ text: "hijacked" }] }] }));
    }).toThrow(/was edited outside every "agent-note" card/);
  });

  test("refuses deleting prose", () => {
    expect(() => {
      judgePage(planOf({ deleteIds: ["prose"] }));
    }).toThrow(/was deleted outside every "agent-note" card/);
  });

  test("refuses creating an ordinary block outside every card", () => {
    expect(() => {
      judgePage(planOf({ creates: [create("loose", PAGE, "text")] }));
    }).toThrow(/was created outside every "agent-note" card/);
  });

  test("T3: refuses MOVING prose into a card — the new chain is not enough", () => {
    // The attack the both-chains rule exists for: the whole page annexed into the
    // agent's own card, attributed to the agent, without deleting a character.
    expect(() => {
      judgePage(planOf({ updates: [{ id: "prose", changes: { parentId: "notes" } }] }));
    }).toThrow(/did not COME from inside an "agent-note" card/);
  });

  test("reports only the FIRST violation, and says how many there were", () => {
    // A page-rooted edit against a garbled document produces one violation per
    // block; three hundred copies of one sentence is not more informative.
    expect(() => {
      judgePage(
        planOf({
          deleteIds: ["prose", "shared"],
          textEdits: [{ blockId: "open", runs: [{ text: "x" }] }],
        }),
      );
    }).toThrow(/block prose was deleted[\s\S]*2 other writes in this edit/);
  });

  test("a card-rooted apply may write anywhere inside its own card", () => {
    // `write_agent_note`'s shape: the root IS the boundary, so everything under
    // it passes — including a delete of the card's own line.
    expect(
      assertNotesOnlyPlan({
        plan: planOf({
          creates: [create("added", "notes", "text")],
          deleteIds: ["note-line"],
        }),
        rows: scope.rows,
        rootId: "notes",
      }),
    ).toEqual(["notes"]);
  });
});

describe("assertNotesOnlyPlan — the two minting invariants", () => {
  test("refuses minting a human-audience card, even INSIDE a card", () => {
    // Rules 1-3 all reason about rows that already exist and cannot see a card
    // the agent is about to create. Inside its own card is where it would
    // otherwise pass every other rule.
    expect(() => {
      judgePage(planOf({ creates: [create("mine", "notes", privateish.type)] }));
    }).toThrow(/addressed to the page's author only/);
  });

  test("refuses RETYPING a survivor into a human-audience card", () => {
    // The strictly-stronger half of moving these onto the plan: a walk over the
    // incoming parsed forest sees a retyped survivor only as an ordinary node it
    // cannot tell from a create, so it could not judge this at all.
    expect(() => {
      judgePage(planOf({ updates: [{ id: "note-line", changes: { type: privateish.type } }] }));
    }).toThrow(/turns block note-line into a "zz-withheld" card/);
  });

  test("refuses a card created inside a card — notes do not nest", () => {
    expect(() => {
      judgePage(planOf({ creates: [create("nested", "notes", agentNotesBlock.type)] }));
    }).toThrow(/notes cards do not nest/);
  });

  test("refuses a card created under a LINE that is inside a card", () => {
    // Nesting is a question about the whole chain, not about the direct parent:
    // a card under a paragraph that lives in a card is nested just as surely.
    expect(() => {
      judgePage(planOf({ creates: [create("nested", "note-line", agentNotesBlock.type)] }));
    }).toThrow(/notes cards do not nest/);
  });

  test("refuses a card created inside a card this same plan created", () => {
    // The after-forest is what makes this visible: the enclosing card does not
    // exist in the stored rows at all.
    expect(() => {
      judgePage(
        planOf({
          creates: [
            create("outer", PAGE, agentNotesBlock.type),
            create("inner", "outer", agentNotesBlock.type),
          ],
        }),
      );
    }).toThrow(/notes cards do not nest/);
  });

  test("the minting verdict wins over the boundary one", () => {
    // A private card minted in open page body breaks both rules. The type answer
    // is the actionable one — it holds wherever the block landed.
    expect(() => {
      judgePage(planOf({ creates: [create("mine", PAGE, privateish.type)] }));
    }).toThrow(/addressed to the page's author only/);
  });
});

describe("assertNotesOnlyPlan — the cards to stamp", () => {
  test("names every card a single edit touched", () => {
    const cards = judgePage(
      planOf({
        creates: [create("fresh", PAGE, agentNotesBlock.type)],
        textEdits: [{ blockId: "note-line", runs: [{ text: "revised" }] }],
      }),
    );
    expect(new Set(cards)).toEqual(new Set(["fresh", "notes"]));
  });

  test("never names a card the plan DELETED — the authorship FK needs the row", () => {
    // Deleting a card is a legal write inside it (its chain reaches itself), but
    // `page_blocks_agent_authors.block_id` FKs onto a row that is about to stop
    // existing.
    expect(judgePage(planOf({ deleteIds: ["tainted"] }))).toEqual([]);
  });

  test("a rank-only update to prose attributes authorship to nobody", () => {
    expect(judgePage(planOf({ updates: [{ id: "prose", changes: { rank: Rank.between(null, null) } }] }))).toEqual(
      [],
    );
  });
});

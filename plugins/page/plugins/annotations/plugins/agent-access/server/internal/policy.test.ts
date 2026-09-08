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
 * plugin's type: the rules enumerate `audience === "human"` and `author` off the
 * registry, so a type invented in this file is treated exactly like `/private`
 * or `/human`. A test that seeded the real four would prove the rules work for
 * the four we have, which is the weaker claim.
 *
 * `agent-note` is the one exception, on both sides: rule 2 is ABOUT that type,
 * and rule 3 names it as the one open boundary, so the fixture uses its real id.
 *
 * The two throwaways cover the two cells that matter to the write rule. Only
 * `author` decides a boundary, so `zz-authored` — agent-audience, human-authored
 * — is the interesting one: an agent READS it and may not write it, which is the
 * `/human` and `/todo` cell and the reason `author` exists as a separate
 * question from `audience`.
 */
const privateish = defineAnnotationBlock({
  type: "zz-withheld",
  schema: z.object({}),
  audience: "human",
  author: "human",
  markdown: { tag: { body: "children" } },
});
const humanish = defineAnnotationBlock({
  type: "zz-authored",
  schema: z.object({}),
  audience: "agent",
  author: "human",
  markdown: { tag: { body: "children" } },
});

beforeEach(() => {
  collectContributions([
    {
      id: "agent-access-policy-fixture",
      contributions: [
        Editor.BlockData(privateish),
        Editor.BlockData(humanish),
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
 * ├── withheld            (audience: human, author: human)
 * │   └── secret
 * │       └── deeper
 * ├── shared              (audience: agent, author: human)
 * │   └── open
 * ├── notes               (agent-note)
 * │   ├── note-line
 * │   └── answer          (audience: agent, author: human — the hole in the
 * │       └── answer-line  agent's own card: it reads this and may not write it)
 * ├── tainted             (agent-note, holding a withheld card — the drag case)
 * │   └── smuggled        (audience: human)
 * └── outer-existing      (agent-note)
 *     └── inner-existing  (agent-note — nesting, which is a legal shape)
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
    row("shared", PAGE, humanish.type),
    row("open", "shared", "text"),
    row("notes", PAGE, agentNotesBlock.type),
    row("note-line", "notes", "text"),
    row("answer", "notes", humanish.type),
    row("answer-line", "answer", "text"),
    row("tainted", PAGE, agentNotesBlock.type),
    row("smuggled", "tainted", privateish.type),
    row("outer-existing", PAGE, agentNotesBlock.type),
    row("inner-existing", "outer-existing", agentNotesBlock.type),
  ],
};

describe("redactHumanAudience (rule 1, the read filter)", () => {
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

  test("an agent-audience annotation is ordinary content to it — author is a SEPARATE axis", () => {
    // `answer` is human-AUTHORED and agent-audience. Redaction keys on audience
    // only, so the agent sees it in full; what it may not do is write it, which
    // is rule 3's business and nothing to do with this filter.
    const kept = redactHumanAudience(scope.rows).map((r) => r.id);
    expect(kept).toContain("open");
    expect(kept).toContain("answer");
    expect(kept).toContain("answer-line");
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

describe("assertAgentAddressable (rule 1, the ancestor half)", () => {
  test("allows the page, ordinary prose, and an agent-audience card's contents", () => {
    for (const id of [PAGE, "prose", "shared", "open", "notes", "note-line"]) {
      expect(() => {
        assertAgentAddressable(scope, id);
      }).not.toThrow();
    }
  });

  test("allows a human-AUTHORED card and its contents — it is addressed TO an agent", () => {
    for (const id of ["answer", "answer-line"]) {
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

describe("assertNoteCard (rule 2 — write_agent_note's door)", () => {
  test("accepts an agent-note card", () => {
    expect(() => {
      assertNoteCard(scope, "notes");
    }).not.toThrow();
  });

  test("refuses prose, an agent-audience card, and the page — naming edit_page", () => {
    for (const id of ["prose", "note-line", "shared", PAGE]) {
      expect(() => {
        assertNoteCard(scope, id);
      }).toThrow(
        /is not an "agent-note" card|is the page itself, not an "agent-note"/,
      );
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

  test("ACCEPTS a card holding a human-AUTHORED card — the door cannot judge that", () => {
    // `notes` holds `answer`. A door check could only refuse the whole card,
    // which would make the nesting useless; what actually matters — whether the
    // document echoed `answer` back or dropped it — is visible on the PLAN, and
    // the case below asserts the drop is refused there.
    expect(() => {
      assertNoteCard(scope, "notes");
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// assertNotesOnlyPlan (rule 3)
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
      judgePage(
        planOf({
          textEdits: [{ blockId: "prose", runs: [{ text: "hijacked" }] }],
        }),
      );
    }).toThrow(/was edited outside every "agent-note" card/);
  });

  test("refuses deleting prose — and words it as a delete, not as a drag", () => {
    // A delete has only an OLD chain, so `side: "old"` says nothing `how` does
    // not; the carried-out wording ("this edit pulls a block into your card")
    // would be a claim about a move that never happened.
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
      judgePage(
        planOf({ updates: [{ id: "prose", changes: { parentId: "notes" } }] }),
      );
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

describe("assertNotesOnlyPlan — a human-authored card is a hole in the agent's own", () => {
  test("refuses a text edit inside it — the page author's words, inside the agent's card", () => {
    expect(() => {
      judgePage(
        planOf({
          textEdits: [{ blockId: "answer-line", runs: [{ text: "no" }] }],
        }),
      );
    }).toThrow(
      /block answer-line was edited, and it sits inside <zz-authored> card answer/,
    );
  });

  test("refuses creating a block inside it", () => {
    expect(() => {
      judgePage(planOf({ creates: [create("intruder", "answer", "text")] }));
    }).toThrow(/sits inside <zz-authored> card answer/);
  });

  test("refuses deleting anything in it", () => {
    expect(() => {
      judgePage(planOf({ deleteIds: ["answer-line"] }));
    }).toThrow(
      /block answer-line was deleted, and it sits inside <zz-authored> card answer/,
    );
  });

  test("refuses deleting the card itself — which is what OMITTING it from a write plans", () => {
    // `write_agent_note` on `notes` composes a whole document; a document that
    // does not echo `<zz-authored id="answer">` back plans exactly this delete,
    // and the whole write is refused with nothing written.
    expect(() => {
      assertNotesOnlyPlan({
        plan: planOf({ deleteIds: ["answer", "answer-line"] }),
        rows: scope.rows,
        rootId: "notes",
      });
    }).toThrow(/the document deletes the <zz-authored> card answer/);
  });

  test("refuses MOVING a block out of it — the old chain is what catches this", () => {
    // The new chain resolves to `notes`, which is open, so an after-only test
    // would call this legal and let an agent launder a human's line into its own
    // card by re-indenting it.
    expect(() => {
      judgePage(
        planOf({
          updates: [{ id: "answer-line", changes: { parentId: "notes" } }],
        }),
      );
    }).toThrow(/came from INSIDE <zz-authored> card answer/);
  });

  test("refuses moving the card itself", () => {
    expect(() => {
      judgePage(
        planOf({ updates: [{ id: "answer", changes: { parentId: PAGE } }] }),
      );
    }).toThrow(/the document rewrites or moves the <zz-authored> card answer/);
  });

  test("an agent-note nested INSIDE it still admits writes — nearest wins both ways", () => {
    // The composition rule read in the other direction. A human may nest an
    // `<agent-note>` in their own card; the walk stops at that card's `author:
    // "agent"` before it ever reaches the human one above.
    const rows = [
      ...scope.rows,
      row("reply", "answer", agentNotesBlock.type),
      row("reply-line", "reply", "text"),
    ];
    expect(
      assertNotesOnlyPlan({
        plan: planOf({
          textEdits: [{ blockId: "reply-line", runs: [{ text: "ok" }] }],
        }),
        rows,
        rootId: PAGE,
      }),
    ).toEqual(["reply"]);
  });

  test("an agent-note MINTED inside it is allowed, for the same reason", () => {
    // Self-inclusion, pointed the other way from the minting case below: the new
    // card declares `author: "agent"` at its own row, so the walk stops there and
    // never reaches the human card holding it. An agent may put its reply inside
    // the author's card; what it may not do is touch what the author wrote.
    expect(
      judgePage(
        planOf({ creates: [create("nested", "answer", agentNotesBlock.type)] }),
      ),
    ).toEqual(["nested"]);
  });

  test("ordinary writes elsewhere in the same card still pass, and stamp it", () => {
    // The hole shields itself and nothing else: the agent's own card is still
    // wholly its own everywhere the human did not claim.
    expect(
      judgePage(
        planOf({
          creates: [create("added", "notes", "text")],
          textEdits: [{ blockId: "note-line", runs: [{ text: "revised" }] }],
        }),
      ),
    ).toEqual(["notes"]);
  });
});

describe("assertNotesOnlyPlan — minting a closed card is the SAME walk", () => {
  test("refuses minting a human-authored card, even INSIDE the agent's own", () => {
    // This is the case that used to be a rule of its own — a separate walk over
    // the plan's creates. It is asserted here to still fail, now through the
    // boundary walk: the created row declares `closed` at its OWN row, and the
    // walk is self-inclusive, so it never reaches the open card above.
    expect(() => {
      judgePage(
        planOf({ creates: [create("mine", "notes", privateish.type)] }),
      );
    }).toThrow(/the document creates a <zz-withheld> card/);
  });

  test("refuses minting one in open page body too — wherever it lands", () => {
    expect(() => {
      judgePage(planOf({ creates: [create("mine", PAGE, humanish.type)] }));
    }).toThrow(/the document creates a <zz-authored> card/);
  });

  test("the refusal says an agent may not author one, and where it MAY write", () => {
    expect(() => {
      judgePage(planOf({ creates: [create("mine", PAGE, privateish.type)] }));
    }).toThrow(
      /page AUTHOR's own words[\s\S]*<agent-note>…<\/agent-note> card instead/,
    );
  });

  test("refuses RETYPING a survivor into a human-authored card", () => {
    // The strictly-stronger half of judging the plan: a walk over the incoming
    // parsed forest sees a retyped survivor only as an ordinary node it cannot
    // tell from a create, so it could not judge this at all.
    expect(() => {
      judgePage(
        planOf({
          updates: [{ id: "note-line", changes: { type: privateish.type } }],
        }),
      );
    }).toThrow(/turns block note-line into a <zz-withheld> card/);
  });
});

describe("assertNotesOnlyPlan — a card inside a card", () => {
  // The rule that used to refuse these ("notes do not nest") is gone: nesting is
  // an ordinary shape, and the boundary judgement reads a nested card as inside a
  // card because it is one. What each case pins is the ATTRIBUTION, which is the
  // only thing nesting changes — `nearestCard` stamps the innermost card, never
  // the parent it sits in.

  test("accepts a card created inside an existing card, and stamps the inner one", () => {
    expect(
      judgePage(
        planOf({ creates: [create("nested", "notes", agentNotesBlock.type)] }),
      ),
    ).toEqual(["nested"]);
  });

  test("accepts a card created under a LINE that is inside a card", () => {
    // Nesting is a question about the whole chain, not about the direct parent —
    // and the chain answer is now "inside a card", not "refused".
    expect(
      judgePage(
        planOf({
          creates: [create("nested", "note-line", agentNotesBlock.type)],
        }),
      ),
    ).toEqual(["nested"]);
  });

  test("accepts a card created inside a card this same plan created", () => {
    // The after-forest is what resolves this at all: the enclosing card does not
    // exist in the stored rows, so only the plan's own creates put it on the chain.
    expect(
      new Set(
        judgePage(
          planOf({
            creates: [
              create("outer", PAGE, agentNotesBlock.type),
              create("inner", "outer", agentNotesBlock.type),
            ],
          }),
        ),
      ),
    ).toEqual(new Set(["outer", "inner"]));
  });

  test("a write inside a nested card stamps that card, not the one holding it", () => {
    expect(
      judgePage(
        planOf({
          creates: [create("line", "inner-existing", "text")],
        }),
      ),
    ).toEqual(["inner-existing"]);
  });

  test("still refuses a human-authored card minted inside a nested card", () => {
    // Nesting loosens the shape, not the write rule: the minted row declares
    // `closed` at itself, however many open cards are stacked above it.
    expect(() => {
      judgePage(
        planOf({
          creates: [create("mine", "inner-existing", privateish.type)],
        }),
      );
    }).toThrow(/the document creates a <zz-withheld> card/);
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

  test("a human-authored card inside the target changes nothing about authorship", () => {
    // The hole is a write rule, not an attribution one: a legal write in `notes`
    // is still attributed to `notes`, which is the card whose `author: "agent"`
    // legalized it.
    expect(
      judgePage(planOf({ creates: [create("added", "notes", "text")] })),
    ).toEqual(["notes"]);
  });

  test("never names a card the plan DELETED — the authorship FK needs the row", () => {
    // Deleting a card is a legal write inside it (its chain reaches itself), but
    // `page_blocks_agent_authors.block_id` FKs onto a row that is about to stop
    // existing.
    expect(judgePage(planOf({ deleteIds: ["tainted"] }))).toEqual([]);
  });

  test("a rank-only update to prose attributes authorship to nobody", () => {
    expect(
      judgePage(
        planOf({
          updates: [
            { id: "prose", changes: { rank: Rank.between(null, null) } },
          ],
        }),
      ),
    ).toEqual([]);
  });
});

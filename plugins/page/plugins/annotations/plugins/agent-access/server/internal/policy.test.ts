import { beforeEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import { collectContributions } from "@plugins/framework/plugins/server-core/core";
import { Editor, type StoredBlock } from "@plugins/page/plugins/editor/server";
import type { SerializedBlock } from "@plugins/page/plugins/editor/core";
import { defineAnnotationBlock } from "@plugins/page/plugins/annotations/core";
import { textBlock } from "@plugins/page/plugins/text/core";
import { agentNotesBlock } from "@plugins/page/plugins/annotations/plugins/agent-notes/core";
import type { BlockScope } from "@plugins/page/plugins/markdown-apply/server";
import {
  assertAgentAddressable,
  assertAppendTarget,
  assertForestWritable,
  assertMarkdownWritable,
  assertWritableNote,
  redactHumanAudience,
} from "./policy";

/**
 * The four policy rules, over a fixture forest.
 *
 * The handles are THROWAWAY annotations registered through the real
 * `defineAnnotationBlock` — the point being that nothing here names a concrete
 * plugin's type: the rules enumerate `audience === "human"` off the registry, so
 * a type invented in this file is treated exactly like `/private-notes`. A test
 * that seeded the real four would prove the rules work for the four we have,
 * which is the weaker claim.
 *
 * `agent-notes` is the one exception, on both sides: rule 2 is ABOUT that type,
 * so the fixture uses its real id.
 */
const privateish = defineAnnotationBlock({
  type: "zz-withheld",
  schema: z.object({}),
  audience: "human",
  // A round-tripping tag, so the `assertMarkdownWritable` cases below can WRITE
  // one. The rules themselves never parse; this is what lets the regression
  // test express its case as the markdown an agent would actually send.
  markdown: { tag: { body: "children" } },
});
const contextish = defineAnnotationBlock({
  type: "zz-shared",
  schema: z.object({}),
  audience: "agent",
  markdown: { tag: { body: "children" } },
});

beforeEach(() => {
  // The throwaway pair proves the rules are generic. The REAL `text` and
  // `agent-notes` handles ride along because `assertMarkdownWritable` parses:
  // without a `defaultText` handle an ordinary line has no type to become, and
  // without the real `agent-notes` handle its tag is not a tag at all — the
  // parse would silently yield something else and the test would pass for the
  // wrong reason.
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
 * ├── notes               (agent-notes)
 * │   └── note-line
 * └── tainted             (agent-notes, holding a withheld card — the drag case)
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
  rows: [
    row("prose", PAGE, "text"),
    row("withheld", PAGE, privateish.type),
    row("secret", "withheld", "text"),
    row("deeper", "secret", "text"),
    row("shared", PAGE, contextish.type),
    row("open", "shared", "text"),
    row("notes", PAGE, "agent-notes"),
    row("note-line", "notes", "text"),
    row("tainted", PAGE, "agent-notes"),
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
});

describe("assertAgentAddressable (rule 3)", () => {
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

describe("assertWritableNote (rules 2 + 4)", () => {
  test("accepts an agent-notes card", () => {
    expect(() => {
      assertWritableNote(scope, "notes");
    }).not.toThrow();
  });

  test("refuses prose, an agent-audience card, and the page itself", () => {
    for (const id of ["prose", "note-line", "shared", PAGE]) {
      expect(() => {
        assertWritableNote(scope, id);
      }).toThrow(/not an "agent-notes" card/);
    }
  });

  test("refuses an agent-notes card that sits inside a withheld one", () => {
    const nested: BlockScope = {
      pageId: PAGE,
      rows: [...scope.rows, row("buried", "withheld", "agent-notes")],
    };
    expect(() => {
      assertWritableNote(nested, "buried");
    }).toThrow(/withheld from agents/);
  });

  test("refuses a card holding withheld content — the drag case", () => {
    // This is what keeps redaction a READ-only concern: a write here would diff
    // against a document that does not show the smuggled card and delete it.
    expect(() => {
      assertWritableNote(scope, "tainted");
    }).toThrow(/would diff against a document that does not show it/);
  });
});

describe("assertAppendTarget", () => {
  test("allows the page and ordinary blocks", () => {
    for (const id of [PAGE, "prose", "shared", "open"]) {
      expect(() => {
        assertAppendTarget(scope, id);
      }).not.toThrow();
    }
  });

  test("refuses a notes card and anything inside one — notes do not nest", () => {
    for (const id of ["notes", "note-line"]) {
      expect(() => {
        assertAppendTarget(scope, id);
      }).toThrow(/do not nest/);
    }
  });

  test("refuses a withheld card's subtree", () => {
    expect(() => {
      assertAppendTarget(scope, "secret");
    }).toThrow(/withheld from agents/);
  });

  test("does NOT mind withheld content elsewhere in the target's subtree", () => {
    // Appending only ever CREATES rows under the target, so a private card
    // sitting further down is neither read nor touched. Rule 4 is about
    // diff-based writes.
    expect(() => {
      assertAppendTarget(scope, PAGE);
    }).not.toThrow();
  });
});

describe("assertForestWritable", () => {
  const node = (type: string, children: SerializedBlock[] = []): SerializedBlock => ({
    type,
    data: {},
    expanded: true,
    children,
  });

  test("accepts an ordinary parsed forest", () => {
    expect(() => {
      assertForestWritable([node("text"), node("bulleted-list"), node("heading-2")]);
    }).not.toThrow();
  });

  test("refuses minting a withheld card, at any depth", () => {
    expect(() => {
      assertForestWritable([node("text", [node(privateish.type)])]);
    }).toThrow(/addressed to the page's author only/);
  });

  test("refuses a nested agent-notes card", () => {
    expect(() => {
      assertForestWritable([node("agent-notes")]);
    }).toThrow(/nested "agent-notes" card/);
  });
});

/**
 * Regression: every tool that accepts markdown must run the forest rules over
 * it, not just the one that creates rows.
 *
 * `write_agent_notes` / `edit_agent_notes` originally passed their string
 * straight to `applyMarkdownToBlock`. Rules 1-4 all reason about rows that
 * ALREADY EXIST, so none of them could see a card the agent was about to mint —
 * and the merge path would happily create a withheld card inside the one
 * container the human trusts as agent-written. It compounds: rule 4 then refuses
 * every LATER write to that card, so the agent bricks the card it was writing to.
 */
describe("assertMarkdownWritable", () => {
  test("accepts ordinary prose", () => {
    expect(() => {
      assertMarkdownWritable("# Findings\n\nA paragraph.\n\n- one\n- two\n");
    }).not.toThrow();
  });

  test("refuses markdown that mints a withheld card", () => {
    expect(() => {
      assertMarkdownWritable(`<${privateish.type}>\n  secret\n</${privateish.type}>\n`);
    }).toThrow(/addressed to the page's author only/);
  });

  test("refuses markdown that nests an agent-notes card", () => {
    expect(() => {
      assertMarkdownWritable("<agent-notes>\n  nested\n</agent-notes>\n");
    }).toThrow(/nested "agent-notes" card/);
  });
});

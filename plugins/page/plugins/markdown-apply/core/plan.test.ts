import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  defineBlock,
  isEmptyPatch,
  namesField,
  parseMarkdownToForest,
  plainOf,
  runsOf,
  serializeForestToMarkdown,
  textBlockSchema,
  textDataSchema,
  type BlockHandle,
  type BlockPatch,
  type MarkdownContext,
  type RichText,
} from "@plugins/page/plugins/editor/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { markdownNodesOfRows } from "./flatten";
import { planMarkdownApply, type MarkdownApplyPlan } from "./plan";
import type { StoredRow } from "./stored-row";

// Handles are built LOCALLY with the real `defineBlock`, mirroring the block
// plugins' declarations — the same choice `markdown.test.ts` makes and for the
// same reason: every block plugin imports the editor's `defineBlock`, so
// importing them back here would form a plugin import cycle the boundary checker
// (which scans test files) would reject.

const text = defineBlock({
  type: "text",
  schema: textDataSchema,
  defaultText: true,
  empty: () => ({ text: [] }),
  markdown: {
    serialize: (d, ctx) => (plainOf(d.text).length === 0 ? "<text/>" : ctx.md(d.text)),
    tag: { name: "text", body: "none", parseAttrs: () => ({ text: [] }) },
  },
});

const bulletedList = defineBlock({
  type: "bulleted-list",
  schema: textDataSchema,
  empty: () => ({ text: [] }),
  marker: "•",
  markdownPrefixes: ["* ", "- ", "+ "],
});

const heading1 = defineBlock({
  type: "heading-1",
  schema: textDataSchema,
  empty: () => ({ text: [] }),
  markdownPrefixes: ["# "],
});

const toDo = defineBlock({
  type: "to-do",
  schema: textBlockSchema({ checked: z.boolean().default(false) }),
  empty: () => ({ text: [], checked: false }),
  markdown: {
    precedence: 10,
    serialize: (d, ctx) => `- [${d.checked ? "x" : " "}] ` + ctx.md(d.text),
    parseLine: (line, ctx) => {
      const m = /^[-*+]?\s*\[([ xX])\]\s+(.*)$/.exec(line);
      if (!m) return null;
      return { text: ctx.runs(m[2]!), checked: m[1]!.toLowerCase() === "x" };
    },
  },
  markdownPrefixes: ["[] ", "[ ] "],
});

const toggle = defineBlock({
  type: "toggle",
  schema: textBlockSchema({}),
  empty: () => ({ text: [] }),
  markdownPrefixes: ["> "],
  collapsible: "always",
});

const quote = defineBlock({
  type: "quote",
  schema: textDataSchema,
  empty: () => ({ text: [] }),
  markdown: { tag: { body: "text" } },
});

const callout = defineBlock({
  type: "callout",
  schema: z.object({
    icon: z.string().nullable().default(null),
    color: z.enum(["default", "info"]).default("default"),
  }),
  empty: () => ({ icon: null, color: "default" as const }),
  anchor: true,
});

const image = defineBlock({
  type: "image",
  schema: z.object({
    attachmentId: z.string().optional(),
    width: z.number().int().positive().optional(),
  }),
  empty: () => ({}),
});

const divider = defineBlock({
  type: "divider",
  schema: z.object({}),
  empty: () => ({}),
  markdown: {
    serialize: () => "---",
    parseLine: (line) => (line.trim() === "---" ? {} : null),
  },
  markdownPrefixes: ["---"],
});

const codeBlock = defineBlock({
  type: "code-block",
  schema: z.object({ code: z.string().default(""), language: z.string().optional() }),
  empty: () => ({ code: "" }),
  markdown: {
    fence: {
      open: "```",
      close: "```",
      parseFenced: (info, body) => ({ code: body, ...(info ? { language: info } : {}) }),
    },
    serialize: (d) => "```" + (d.language ?? "") + "\n" + d.code + "\n```",
  },
  markdownPrefixes: ["```"],
});

// The two `<page …>` halves: the sub-page SERIALIZES the tag (identity from
// `ctx.id`), `page-link` OWNS it on parse.
const page = defineBlock({
  type: "page",
  schema: z.object({ title: z.string(), icon: z.string().nullable() }),
  markdown: {
    tag: {
      name: "page",
      body: "children-when-expanded",
      attrs: (_data, ctx) => {
        if (ctx.id === undefined) throw new Error("a `page` block needs its row id");
        return { id: ctx.id };
      },
      serializeOnly: true,
    },
  },
});

const pageLink = defineBlock({
  type: "page-link",
  schema: z.object({ pageId: z.string() }),
  empty: () => ({ pageId: "" }),
  markdown: {
    tag: {
      name: "page",
      body: "none",
      attrs: (data) => ({ id: data.pageId }),
      parseAttrs: (attrs) => {
        const id = attrs.id;
        if (id === undefined || id === "") throw new Error("<page/> needs an `id`");
        return { pageId: id };
      },
    },
  },
});

const handles: BlockHandle<unknown>[] = [
  text,
  bulletedList,
  heading1,
  toDo,
  toggle,
  quote,
  callout,
  image,
  divider,
  codeBlock,
  page,
  pageLink,
] as BlockHandle<unknown>[];

const byType = new Map(handles.map((h) => [h.type, h] as const));
const ctx: MarkdownContext = { handles, protectedSpans: [] };

const PAGE_ID = "PAGE";

// ---------------------------------------------------------------------------
// Row fixtures
// ---------------------------------------------------------------------------

interface RawNode {
  type: string;
  data: unknown;
  children: RawNode[];
}

const raw = (type: string, data: unknown, children: RawNode[] = []): RawNode => ({
  type,
  data,
  children,
});
const runs = (s: string): RichText => (s ? [{ text: s }] : []);

/** Ids in DFS order (`b1`, `b2`, …); ranks minted per sibling list. */
function rowsOf(forest: RawNode[], pageId = PAGE_ID): StoredRow[] {
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
  walk(forest, pageId);
  return rows;
}

const markdownOf = (rows: StoredRow[], pageId = PAGE_ID): string =>
  serializeForestToMarkdown(markdownNodesOfRows(rows, pageId), ctx);

function planOf(rows: StoredRow[], md: string, pageId = PAGE_ID): MarkdownApplyPlan {
  const result = planMarkdownApply({
    pageId,
    existing: rows,
    incoming: parseMarkdownToForest(md, ctx),
    handles,
  });
  if (!result.ok) throw new Error(`refused: ${result.reason} — ${result.detail}`);
  return result.plan;
}

/** Round-trip a page through markdown and plan the result back onto it. */
const replan = (rows: StoredRow[]): MarkdownApplyPlan => planOf(rows, markdownOf(rows));

const namedFields = (patch: BlockPatch): Set<string> => {
  const named = new Set<string>();
  for (const u of patch.updates) for (const k of Object.keys(u.changes)) named.add(k);
  return named;
};

const plainTextOfRow = (row: StoredRow): string =>
  plainOf((row.data as { text?: unknown }).text);

/**
 * The write path, modelled: apply the patch's row changes AND the text channel's
 * runs (which the real applier splices into each block's content doc and then
 * projects back onto `data.text`). Everything downstream of the plan reads the
 * result of BOTH channels, so a test that applied only the patch would be
 * checking half the answer.
 */
function applyPlan(rows: StoredRow[], plan: MarkdownApplyPlan): StoredRow[] {
  const gone = new Set(plan.patch.deleteIds);
  const out = rows.filter((row) => !gone.has(row.id)).map((row) => ({ ...row }));
  const byId = new Map(out.map((row) => [row.id, row] as const));
  for (const update of plan.patch.updates) {
    const row = byId.get(update.id);
    if (!row) continue; // an update never creates
    if (namesField(update.changes, "parentId")) row.parentId = update.changes.parentId!;
    if (namesField(update.changes, "type")) row.type = update.changes.type!;
    if (namesField(update.changes, "rank")) row.rank = String(update.changes.rank);
    if (namesField(update.changes, "expanded")) row.expanded = update.changes.expanded!;
    if (namesField(update.changes, "data")) row.data = update.changes.data;
  }
  for (const created of plan.patch.creates) {
    out.push({
      id: created.id,
      parentId: created.parentId,
      type: created.type,
      data: created.data,
      rank: String(created.rank),
      expanded: created.expanded,
    });
  }
  for (const edit of plan.textEdits) {
    const row = out.find((r) => r.id === edit.blockId);
    if (!row) continue;
    row.data = { ...(row.data as object), text: edit.runs };
  }
  return out;
}

/**
 * THE end-to-end property of the engine: whatever the plan is, applying it must
 * reproduce the document that was asked for. Every field-level assertion below
 * is about MINIMALITY; this one is about correctness, and it is what makes the
 * minimality assertions safe to relax where two answers are equally minimal.
 */
function expectConverges(rows: StoredRow[], target: StoredRow[], label: unknown): void {
  const md = markdownOf(target);
  const plan = planOf(rows, md);
  expect({ label, md: markdownOf(applyPlan(rows, plan)) }).toEqual({ label, md });
}

// ---------------------------------------------------------------------------
// THE property: identity ⇒ no writes
// ---------------------------------------------------------------------------

describe("identity ⇒ no writes", () => {
  test("a page re-applied from its own markdown emits nothing", () => {
    const rows = rowsOf([
      raw("heading-1", { text: runs("Title") }),
      raw("text", { text: runs("A paragraph.") }, [
        raw("bulleted-list", { text: runs("nested") }),
      ]),
      raw("to-do", { text: runs("ship it"), checked: true }),
      raw("code-block", { code: "const x = 1;", language: "ts" }),
      raw("divider", {}),
      raw("image", { attachmentId: "att_1", width: 640 }),
      raw("page", { title: "Sub", icon: null }),
    ]);
    const plan = replan(rows);
    expect(isEmptyPatch(plan.patch)).toBe(true);
    expect(plan.textEdits).toEqual([]);
    expect(plan.stats).toEqual({ survived: rows.length, created: 0, deleted: 0, moved: 0 });
  });

  test("a COLLAPSED block stays collapsed — `expanded` is never written", () => {
    // A parsed forest is uniformly `expanded: true`, so the only thing standing
    // between an apply and every collapse state on the page is this invariant.
    const rows = rowsOf([
      raw("toggle", { text: runs("folded") }, [raw("text", { text: runs("hidden") })]),
    ]);
    rows[0]!.expanded = false;
    const plan = replan(rows);
    expect(isEmptyPatch(plan.patch)).toBe(true);
  });

  test("marks-only differences ride the TEXT channel, never the row", () => {
    const rows = rowsOf([raw("text", { text: runs("hello") })]);
    const md = "**hello**";
    const plan = planOf(rows, md);
    expect(isEmptyPatch(plan.patch)).toBe(true);
    expect(plan.textEdits).toEqual([{ blockId: "b1", runs: [{ text: "hello", marks: ["bold"] }] }]);
  });
});

// ---------------------------------------------------------------------------
// The case that motivates an LCS over a content bucket
// ---------------------------------------------------------------------------

describe("repeated identical lines", () => {
  const fiveItems = (): StoredRow[] =>
    rowsOf([
      raw("bulleted-list", { text: runs("item") }),
      raw("bulleted-list", { text: runs("item") }),
      raw("bulleted-list", { text: runs("item") }),
      raw("bulleted-list", { text: runs("item") }),
      raw("bulleted-list", { text: runs("item") }),
    ]);

  test("editing one of five identical bullets keeps ALL FIVE ids", () => {
    // The case that motivates an LCS over the pages-history content bucket: five
    // identical keys. A bucket matcher pops them in arbitrary order, so editing
    // one re-pairs the lot. Which of the five ends up carrying the edited text is
    // genuinely unanswerable — the rows are indistinguishable — so the assertion
    // is on the id SET, plus the single text edit and the absence of churn.
    const rows = fiveItems();
    const md = ["* item", "* item", "* item edited", "* item", "* item"].join("\n");
    const plan = planOf(rows, md);
    expect(plan.patch.creates).toEqual([]);
    expect(plan.patch.deleteIds).toEqual([]);
    expect(plan.textEdits).toHaveLength(1);
    expect(plan.textEdits[0]!.runs).toEqual([{ text: "item edited" }]);
    expect(markdownOf(applyPlan(rows, plan))).toBe(md);
  });

  test("deleting the FOURTH of five identical bullets deletes exactly one row", () => {
    const rows = fiveItems();
    const md = ["* item", "* item", "* item", "* item"].join("\n");
    const plan = planOf(rows, md);
    // Any of the five would be a "correct" delete by content alone; only a
    // positional alignment can say which, and the ranks prove it picked one
    // WITHOUT re-ranking the survivors.
    expect(plan.patch.deleteIds).toHaveLength(1);
    expect(plan.patch.creates).toEqual([]);
    expect(plan.patch.updates).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Sub-pages
// ---------------------------------------------------------------------------

describe("sub-pages", () => {
  const withShell = (): StoredRow[] =>
    rowsOf([
      raw("text", { text: runs("before") }),
      raw("page", { title: "Sub", icon: null }),
      raw("text", { text: runs("after") }),
    ]);

  test("a shell OMITTED from the markdown is preserved, never deleted", () => {
    const rows = withShell();
    const md = ["before", "after"].join("\n");
    const plan = planOf(rows, md);
    expect(plan.patch.deleteIds).toEqual([]);
    expect(plan.patch.creates).toEqual([]);
    // Kept at the top level, after everything the document did place.
    const shellUpdate = plan.patch.updates.find((u) => u.id === "b2");
    expect(shellUpdate).toBeDefined();
    expect(namesField(shellUpdate!.changes, "rank")).toBe(true);
    const shellRank = String(shellUpdate!.changes.rank);
    const others = ["b1", "b3"].map((id) => rows.find((r) => r.id === id)!.rank);
    for (const rank of others) {
      expect(Rank.compare(Rank.from(shellRank), Rank.from(rank))).toBe(1);
    }
  });

  test("a shell MOVED in the markdown is repositioned, keeping its id", () => {
    const rows = withShell();
    const md = ["before", "after", `<page id="b2"/>`].join("\n");
    const plan = planOf(rows, md);
    expect(plan.patch.deleteIds).toEqual([]);
    expect(plan.patch.creates).toEqual([]);
    // ONE re-rank realizes the reorder. Which of the two blocks that swapped
    // places is the one that "moved" is not determined — two subsequences of the
    // stored ranks are equally long — so the assertion is that the cost is one
    // rank, and that the document really ends up in the asked-for order.
    expect(plan.patch.updates).toHaveLength(1);
    expect(Object.keys(plan.patch.updates[0]!.changes)).toEqual(["rank"]);
    expect(markdownOf(applyPlan(rows, plan))).toBe(md);
  });

  test("a shell never takes the pointer type's `type` or `data`", () => {
    const rows = withShell();
    const plan = replan(rows);
    expect(isEmptyPatch(plan.patch)).toBe(true);
  });

  test("an INVENTED page reference is refused, loudly", () => {
    const rows = withShell();
    const md = ["before", `<page id="ghost"/>`, "after", `<page id="b2"/>`].join("\n");
    const result = planMarkdownApply({
      pageId: PAGE_ID,
      existing: rows,
      incoming: parseMarkdownToForest(md, ctx),
      handles,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("unknown-page-ref");
  });

  test("a page-link the document ALREADY holds round-trips (it vouches for itself)", () => {
    // The same `<page id="…"/>` syntax serializes an ordinary link-to-page block
    // pointing anywhere. Refusing every id that is not a sub-page of THIS page
    // would break every such block on every apply.
    const rows = rowsOf([
      raw("text", { text: runs("see") }),
      raw("page-link", { pageId: "elsewhere" }),
    ]);
    const plan = replan(rows);
    expect(isEmptyPatch(plan.patch)).toBe(true);
  });

  test("referencing one shell TWICE is refused rather than duplicated", () => {
    const rows = withShell();
    const md = ["before", `<page id="b2"/>`, "after", `<page id="b2"/>`].join("\n");
    const result = planMarkdownApply({
      pageId: PAGE_ID,
      existing: rows,
      incoming: parseMarkdownToForest(md, ctx),
      handles,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("subpage-reparented");
  });

  test("a shell whose PARENT is deleted survives at the top level", () => {
    const rows = rowsOf([
      raw("text", { text: runs("parent") }, [raw("page", { title: "Sub", icon: null })]),
    ]);
    // The whole document is emptied — so the shell's parent really is deleted,
    // and the shell has to be lifted out BEFORE the delete cascade reaches it
    // (which is exactly the order `applyPageBlockPatch` writes in).
    const plan = planOf(rows, "");
    expect(plan.patch.deleteIds).toEqual(["b1"]);
    const shellUpdate = plan.patch.updates.find((u) => u.id === "b2")!;
    expect(shellUpdate.changes.parentId).toBe(PAGE_ID);
  });
});

// ---------------------------------------------------------------------------
// Minimality of each individual change
// ---------------------------------------------------------------------------

describe("a change names exactly the fields it changes", () => {
  test("a text edit names NO row field at all", () => {
    const rows = rowsOf([
      raw("text", { text: runs("alpha") }),
      raw("text", { text: runs("bravo") }),
    ]);
    const plan = planOf(rows, ["alpha", "bravo tweaked"].join("\n"));
    expect(isEmptyPatch(plan.patch)).toBe(true);
    expect(plan.textEdits).toEqual([{ blockId: "b2", runs: [{ text: "bravo tweaked" }] }]);
  });

  test("a conversion names `type` and nothing else", () => {
    const rows = rowsOf([raw("text", { text: runs("alpha") })]);
    const plan = planOf(rows, "# alpha");
    expect(plan.patch.updates).toEqual([{ id: "b1", changes: { type: "heading-1" } }]);
    expect(plan.textEdits).toEqual([]);
  });

  test("a data-only edit names `data`, and its `text` restates the row's own", () => {
    const rows = rowsOf([raw("to-do", { text: runs("ship it"), checked: false })]);
    const plan = planOf(rows, "- [x] ship it");
    expect(plan.patch.updates).toHaveLength(1);
    expect(plan.patch.updates[0]!.changes).toEqual({
      data: { text: runs("ship it"), checked: true },
    });
    expect(plan.textEdits).toEqual([]);
  });

  test("an indent names `parentId` and `rank`, and nothing else moves", () => {
    const rows = rowsOf([
      raw("text", { text: runs("alpha") }),
      raw("text", { text: runs("bravo") }),
    ]);
    const plan = planOf(rows, ["alpha", "  bravo"].join("\n"));
    expect(plan.patch.updates).toHaveLength(1);
    expect(plan.patch.updates[0]!.id).toBe("b2");
    expect(new Set(Object.keys(plan.patch.updates[0]!.changes))).toEqual(
      new Set(["parentId", "rank"]),
    );
  });

  test("inserting a line re-ranks NO sibling", () => {
    const rows = rowsOf([
      raw("text", { text: runs("alpha") }),
      raw("text", { text: runs("bravo") }),
    ]);
    const plan = planOf(rows, ["alpha", "inserted", "bravo"].join("\n"));
    expect(plan.patch.updates).toEqual([]);
    expect(plan.patch.creates).toHaveLength(1);
    expect(plan.patch.creates[0]!.expanded).toBe(true);
    expect(plan.patch.creates[0]!.parentId).toBe(PAGE_ID);
    const created = Rank.from(String(plan.patch.creates[0]!.rank));
    expect(Rank.compare(created, Rank.from(rows[0]!.rank))).toBe(1);
    expect(Rank.compare(created, Rank.from(rows[1]!.rank))).toBe(-1);
  });

  test("a block that MOVED across the document keeps its id", () => {
    // The move shows up as a removal in one alignment gap and an insertion in
    // another, which a gap-local matcher can never pair — this is the whole-
    // document pass.
    const rows = rowsOf([
      raw("text", { text: runs("alpha") }),
      raw("text", { text: runs("bravo") }),
      raw("text", { text: runs("charlie") }),
      raw("text", { text: runs("delta") }),
    ]);
    const plan = planOf(rows, ["bravo", "charlie", "delta", "alpha"].join("\n"));
    expect(plan.patch.creates).toEqual([]);
    expect(plan.patch.deleteIds).toEqual([]);
    expect(plan.patch.updates.map((u) => u.id)).toEqual(["b1"]);
  });
});

// ---------------------------------------------------------------------------
// Fuzz
// ---------------------------------------------------------------------------

/** Mulberry32 — deterministic, so a failure is reproducible from its seed. */
const rng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Words chosen so no generated line can be claimed by a PREFIX parser — the same
// (pre-existing) lossiness of markdown itself `markdown.test.ts` works around.
const words = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf"];

function pickRuns(r: () => number): RichText {
  const n = 1 + Math.floor(r() * 3);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(words[Math.floor(r() * words.length)]!);
  const marks = r() < 0.2 ? (["bold"] as const) : undefined;
  return [{ text: parts.join(" "), ...(marks ? { marks: [...marks] } : {}) }];
}

const gens: { type: string; data(r: () => number): unknown; children: boolean }[] = [
  { type: "text", data: (r) => ({ text: pickRuns(r) }), children: true },
  { type: "bulleted-list", data: (r) => ({ text: pickRuns(r) }), children: true },
  { type: "heading-1", data: (r) => ({ text: pickRuns(r) }), children: true },
  { type: "toggle", data: (r) => ({ text: pickRuns(r) }), children: true },
  { type: "quote", data: (r) => ({ text: pickRuns(r) }), children: true },
  {
    type: "to-do",
    data: (r) => ({ text: pickRuns(r), checked: r() < 0.5 }),
    children: true,
  },
  { type: "divider", data: () => ({}), children: false },
  {
    type: "code-block",
    data: (r) => ({
      code: `const x = ${Math.floor(r() * 100)};`,
      ...(r() < 0.5 ? { language: "ts" } : {}),
    }),
    children: false,
  },
  {
    type: "callout",
    data: (r) => ({
      icon: r() < 0.5 ? null : "info",
      color: r() < 0.5 ? ("default" as const) : ("info" as const),
    }),
    children: true,
  },
  {
    type: "image",
    data: (r) => ({
      attachmentId: `att_${Math.floor(r() * 1000)}`,
      ...(r() < 0.5 ? { width: 320 + Math.floor(r() * 640) } : {}),
    }),
    children: false,
  },
  {
    type: "page-link",
    data: (r) => ({ pageId: `p${Math.floor(r() * 99)}` }),
    children: false,
  },
  // A sub-page SHELL: a leaf of this page's forest (its content lives under a
  // different `page_id` partition and is not in these rows at all).
  { type: "page", data: () => ({ title: "Sub", icon: null }), children: false },
];

function buildRaw(r: () => number, depth: number): RawNode {
  const gen = gens[Math.floor(r() * gens.length)]!;
  const kids: RawNode[] = [];
  if (gen.children && depth < 3) {
    const n = Math.floor(r() * (depth === 0 ? 3 : 2));
    for (let i = 0; i < n; i++) kids.push(buildRaw(r, depth + 1));
  }
  return { type: gen.type, data: gen.data(r), children: kids };
}

function fuzzRows(seed: number): StoredRow[] {
  const r = rng(seed);
  const forest: RawNode[] = [];
  const roots = 1 + Math.floor(r() * 5);
  for (let i = 0; i < roots; i++) forest.push(buildRaw(r, 0));
  return rowsOf(forest);
}

describe("fuzz: identity ⇒ no writes", () => {
  test("planMarkdownApply(rows, parse(serialize(rows))) is empty, over 400 seeds", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const rows = fuzzRows(seed);
      const plan = replan(rows);
      expect({ seed, patch: plan.patch }).toEqual({
        seed,
        patch: { creates: [], updates: [], deleteIds: [] },
      });
      expect({ seed, textEdits: plan.textEdits }).toEqual({ seed, textEdits: [] });
      expect({ seed, survived: plan.stats.survived }).toEqual({
        seed,
        survived: rows.length,
      });
    }
  });
});

// --- Edit scripts ----------------------------------------------------------

const clone = (rows: StoredRow[]): StoredRow[] => rows.map((row) => ({ ...row }));
const isShellRow = (row: StoredRow): boolean => row.type === "page";
const isTextRow = (row: StoredRow): boolean => byType.get(row.type)?.text !== undefined;

function subtreeIds(rows: StoredRow[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of rows) {
      if (row.parentId !== null && ids.has(row.parentId) && !ids.has(row.id)) {
        ids.add(row.id);
        grew = true;
      }
    }
  }
  return ids;
}

function siblingsOf(rows: StoredRow[], parentId: string): StoredRow[] {
  return rows
    .filter((row) => row.parentId === parentId)
    .sort((a, b) => Rank.compare(Rank.from(a.rank), Rank.from(b.rank)));
}

/** A rank placing a row at slot `at` of `parentId`'s sibling list. */
function rankAt(rows: StoredRow[], parentId: string, at: number, excludeId?: string): string {
  const list = siblingsOf(rows, parentId).filter((row) => row.id !== excludeId);
  const prev = at > 0 ? Rank.from(list[at - 1]!.rank) : null;
  const next = at < list.length ? Rank.from(list[at]!.rank) : null;
  return Rank.between(prev, next).toJSON();
}

const pickFrom = <T,>(r: () => number, items: T[]): T | undefined =>
  items.length === 0 ? undefined : items[Math.floor(r() * items.length)];

describe("fuzz: one edit at a time", () => {
  test("retext — the patch is empty and exactly that block gets a text edit", () => {
    let exercised = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed * 7919);
      const rows = fuzzRows(seed);
      // A row whose text is unique in the document, so "which block was edited"
      // has one answer rather than several equally good ones.
      const target = pickFrom(
        r,
        rows.filter(
          (row) =>
            isTextRow(row) &&
            rows.filter((x) => isTextRow(x) && plainTextOfRow(x) === plainTextOfRow(row))
              .length === 1,
        ),
      );
      if (!target) continue;
      exercised += 1;
      const edited = clone(rows);
      const row = edited.find((x) => x.id === target.id)!;
      row.data = { ...(row.data as object), text: runs(`${plainTextOfRow(target)} tweak${seed}`) };
      const plan = planOf(rows, markdownOf(edited));
      expect({ seed, patch: plan.patch }).toEqual({
        seed,
        patch: { creates: [], updates: [], deleteIds: [] },
      });
      expect({ seed, ids: plan.textEdits.map((e) => e.blockId) }).toEqual({
        seed,
        ids: [target.id],
      });
      expectConverges(rows, edited, seed);
    }
    expect(exercised).toBeGreaterThan(100);
  });

  test("retype — exactly `type`, for exactly that block", () => {
    let exercised = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed * 104729);
      const rows = fuzzRows(seed);
      // Only between types sharing `textDataSchema`, so `data` genuinely doesn't
      // change — a to-do would legitimately gain/lose `checked`.
      const plain = ["text", "bulleted-list", "heading-1"];
      const target = pickFrom(
        r,
        rows.filter(
          (row) =>
            plain.includes(row.type) &&
            plainTextOfRow(row).length > 0 &&
            rows.filter((x) => plainTextOfRow(x) === plainTextOfRow(row)).length === 1,
        ),
      );
      if (!target) continue;
      const nextType = plain.filter((t) => t !== target.type)[Math.floor(r() * 2)]!;
      exercised += 1;
      const edited = clone(rows);
      edited.find((x) => x.id === target.id)!.type = nextType;
      const plan = planOf(rows, markdownOf(edited));
      expect({ seed, updates: plan.patch.updates }).toEqual({
        seed,
        updates: [{ id: target.id, changes: { type: nextType } }],
      });
      expect({ seed, creates: plan.patch.creates.length, deletes: plan.patch.deleteIds }).toEqual(
        { seed, creates: 0, deletes: [] },
      );
      expectConverges(rows, edited, seed);
    }
    expect(exercised).toBeGreaterThan(60);
  });

  test("delete — exactly that subtree, with no other row touched", () => {
    let exercised = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed * 15485863);
      const rows = fuzzRows(seed);
      // A shell is never deleted by an apply — that case is its own test above.
      const candidates = rows.filter(
        (row) => !isShellRow(row) && ![...subtreeIds(rows, row.id)].some((id) =>
          isShellRow(rows.find((x) => x.id === id)!),
        ),
      );
      const target = pickFrom(r, candidates);
      if (!target) continue;
      exercised += 1;
      const gone = subtreeIds(rows, target.id);
      const edited = rows.filter((row) => !gone.has(row.id));
      const plan = planOf(rows, markdownOf(edited));
      // Exactly as many rows leave as were removed, nothing is created, and no
      // survivor's CONTENT is rewritten. WHICH ids leave is only determined up to
      // content — two identical dividers are interchangeable, and picking the
      // other one costs a placement write instead — so the field assertion is
      // that nothing but placement moves.
      expect({ seed, deleted: plan.patch.deleteIds.length }).toEqual({
        seed,
        deleted: gone.size,
      });
      expect({ seed, creates: plan.patch.creates, texts: plan.textEdits }).toEqual({
        seed,
        creates: [],
        texts: [],
      });
      const fields = [...namedFields(plan.patch)].sort();
      expect({ seed, fields }).toEqual({
        seed,
        fields: fields.filter((f) => f === "parentId" || f === "rank"),
      });
      expectConverges(rows, edited, seed);
    }
    expect(exercised).toBeGreaterThan(100);
  });

  test("insert — one create, no sibling re-ranked", () => {
    let exercised = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed * 32452843);
      const rows = fuzzRows(seed);
      const parents: string[] = [
        PAGE_ID,
        ...rows.filter((row) => !isShellRow(row) && isTextRow(row)).map((row) => row.id),
      ];
      const parentId = pickFrom(r, parents)!;
      const at = Math.floor(r() * (siblingsOf(rows, parentId).length + 1));
      exercised += 1;
      const edited = clone(rows);
      edited.push({
        id: "NEW",
        parentId,
        type: "text",
        data: { text: runs(`freshly inserted line ${seed}`) },
        rank: rankAt(edited, parentId, at),
        expanded: true,
      });
      const plan = planOf(rows, markdownOf(edited));
      expect({ seed, updates: plan.patch.updates, deletes: plan.patch.deleteIds }).toEqual({
        seed,
        updates: [],
        deletes: [],
      });
      expect({ seed, creates: plan.patch.creates.length }).toEqual({ seed, creates: 1 });
      expect({ seed, parent: plan.patch.creates[0]!.parentId }).toEqual({
        seed,
        parent: parentId,
      });
      expectConverges(rows, edited, seed);
    }
    expect(exercised).toBeGreaterThan(150);
  });

  test("move — one update naming only placement, nothing created or deleted", () => {
    let exercised = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed * 49979687);
      const rows = fuzzRows(seed);
      // A leaf whose plain text is unique in the document, so the whole-document
      // pass has an unambiguous partner to re-pair it with.
      const leaves = rows.filter(
        (row) =>
          !isShellRow(row) &&
          isTextRow(row) &&
          plainTextOfRow(row).length > 0 &&
          rows.filter((x) => plainTextOfRow(x) === plainTextOfRow(row)).length === 1 &&
          !rows.some((x) => x.parentId === row.id),
      );
      const target = pickFrom(r, leaves);
      if (!target) continue;
      const destinations = [
        PAGE_ID,
        ...rows
          .filter((row) => row.id !== target.id && !isShellRow(row) && isTextRow(row))
          .map((row) => row.id),
      ];
      const parentId = pickFrom(r, destinations)!;
      const edited = clone(rows);
      const moved = edited.find((x) => x.id === target.id)!;
      const slots = siblingsOf(edited, parentId).filter((x) => x.id !== target.id).length;
      const at = Math.floor(r() * (slots + 1));
      const rank = rankAt(edited, parentId, at, target.id);
      if (parentId === moved.parentId && rank === moved.rank) continue;
      moved.parentId = parentId;
      moved.rank = rank;
      if (markdownOf(edited) === markdownOf(rows)) continue;
      exercised += 1;
      const plan = planOf(rows, markdownOf(edited));
      expect({ seed, creates: plan.patch.creates, deletes: plan.patch.deleteIds }).toEqual({
        seed,
        creates: [],
        deletes: [],
      });
      const fields = [...namedFields(plan.patch)].sort();
      expect({ seed, fields }).toEqual({
        seed,
        fields: fields.filter((f) => f === "parentId" || f === "rank"),
      });
      expectConverges(rows, edited, seed);
    }
    expect(exercised).toBeGreaterThan(80);
  });
});

// ---------------------------------------------------------------------------
// The two survivor invariants, asserted over everything the fuzz produces
// ---------------------------------------------------------------------------

describe("survivor invariants", () => {
  test("`expanded` is NEVER named for a survivor, over every fuzzed edit", () => {
    for (let seed = 1; seed <= 150; seed++) {
      const r = rng(seed * 86028121);
      const rows = fuzzRows(seed);
      const edited = clone(rows);
      // One arbitrary mutation of each shape, all at once — a worst case rather
      // than a single edit, so the invariant is tested against real churn.
      const textRow = pickFrom(r, edited.filter(isTextRow));
      if (textRow) {
        textRow.data = { ...(textRow.data as object), text: runs(`rewritten ${seed}`) };
      }
      const doomed = pickFrom(r, edited.filter((row) => !isShellRow(row)));
      const survivors = doomed
        ? edited.filter((row) => !subtreeIds(edited, doomed.id).has(row.id))
        : edited;
      const plan = planOf(rows, markdownOf(survivors));
      for (const update of plan.patch.updates) {
        expect({ seed, id: update.id, expanded: namesField(update.changes, "expanded") }).toEqual(
          { seed, id: update.id, expanded: false },
        );
      }
    }
  });

  test("a survivor's `data` always restates the row's OWN text", () => {
    for (let seed = 1; seed <= 150; seed++) {
      const r = rng(seed * 122949829);
      const rows = fuzzRows(seed);
      const edited = clone(rows);
      const toggled = pickFrom(r, edited.filter((row) => row.type === "to-do"));
      if (toggled) {
        toggled.data = {
          ...(toggled.data as { checked: boolean }),
          checked: !(toggled.data as { checked: boolean }).checked,
        };
      }
      const textRow = pickFrom(r, edited.filter(isTextRow));
      if (textRow) {
        textRow.data = { ...(textRow.data as object), text: runs(`rewritten ${seed}`) };
      }
      const plan = planOf(rows, markdownOf(edited));
      for (const update of plan.patch.updates) {
        if (!namesField(update.changes, "data")) continue;
        const before = rows.find((row) => row.id === update.id)!;
        expect({
          seed,
          id: update.id,
          text: plainOf(runsOf((update.changes.data as { text?: unknown }).text)),
        }).toEqual({ seed, id: update.id, text: plainOf(runsOf((before.data as { text?: unknown }).text)) });
      }
    }
  });
});

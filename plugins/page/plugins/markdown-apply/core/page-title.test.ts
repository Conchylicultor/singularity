import { describe, expect, test } from "bun:test";
import {
  defineBlock,
  isEmptyPatch,
  parseMarkdownToForest,
  plainOf,
  serializeForestToMarkdown,
  textDataSchema,
  type BlockHandle,
  type MarkdownContext,
} from "@plugins/page/plugins/editor/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { markdownNodesOfRows } from "./flatten";
import { pageTitleBanner, stripPageTitleBanner } from "./page-title";
import { planMarkdownApply } from "./plan";
import type { StoredRow } from "./stored-row";

// Handles are built LOCALLY with the real `defineBlock`, as `plan.test.ts` and
// `markdown.test.ts` do and for the same reason: importing the block plugins
// back here would form a plugin import cycle the boundary checker rejects.

const text = defineBlock({
  type: "text",
  schema: textDataSchema,
  defaultText: true,
  empty: () => ({ text: [] }),
  // Mirrors `page/text`: an empty paragraph is a blank line, and the tag stays
  // parse-only so `<text/>` written before that dialect still comes back.
  markdown: {
    serialize: (d, ctx) => (plainOf(d.text).length === 0 ? "" : ctx.md(d.text)),
    tag: {
      name: "text",
      body: "none",
      // Mirrors `page/text`: no attributes, so the pin emits a bare `<text/>`
      // rather than the derived `<text data="{&quot;text&quot;:[]}"/>`.
      attrs: () => ({}),
      parseAttrs: () => ({ text: [] }),
    },
  },
});

const heading1 = defineBlock({
  type: "heading-1",
  schema: textDataSchema,
  empty: () => ({ text: [] }),
  markdownPrefixes: ["# "],
});

const handles = [text, heading1] as BlockHandle<unknown>[];
const ctx: MarkdownContext = {
  handles,
  protectedSpans: [],
  // The server dialect: this module's documents are ones this codebase emitted.
  blankLines: "empty-block",
  // The server dialect on the way out too: an empty paragraph whose position a
  // blank line cannot state is pinned as `<text/>`, so a faithful read applied
  // straight back plans nothing.
  emptyBlocks: "pinned",
};

describe("pageTitleBanner", () => {
  test("is a `# Title` line plus the blank line after it", () => {
    expect(pageTitleBanner("Design notes", ctx)).toBe("# Design notes\n\n");
  });

  // The escaping cases are the ones that matter even when the strip succeeds:
  // the READ is what an agent acts on, so a title must not be able to open a
  // construct the rest of the document then lives inside.
  test("escapes a title that would otherwise forge inline structure", () => {
    expect(pageTitleBanner("a * b", ctx)).toBe("# a \\* b\n\n");
    expect(pageTitleBanner("**bold**", ctx)).toBe("# \\*\\*bold\\*\\*\n\n");
    expect(pageTitleBanner("`code`", ctx)).toBe("# \\`code\\`\n\n");
  });

  test("escapes a title that would otherwise open a tag", () => {
    // `<` is escaped (it is what BEGINS a tag); `>` carries no inline meaning
    // and stays literal, so the open tag can never form.
    expect(pageTitleBanner('<agent-note id="x">', ctx)).toBe(
      '# \\<agent-note id="x">\n\n',
    );
  });

  test("collapses line terminators, so the banner is always ONE line", () => {
    for (const title of ["a\nb", "a\r\nb", "a\rb"]) {
      const banner = pageTitleBanner(title, ctx);
      expect(banner).toBe("# a b\n\n");
      expect(banner.split("\n").filter((l) => l !== "")).toHaveLength(1);
    }
  });
});

describe("stripPageTitleBanner", () => {
  const banner = pageTitleBanner("Design notes", ctx);

  test("strips a first non-empty line byte-identical to the banner", () => {
    expect(stripPageTitleBanner(`${banner}Body line`, banner)).toBe(
      "Body line",
    );
  });

  test("is the exact inverse of prepending, for any document", () => {
    for (const doc of [
      "",
      "one",
      "one\n\ntwo",
      "# Design notes",
      "  indented",
    ]) {
      expect(stripPageTitleBanner(banner + doc, banner)).toBe(doc);
    }
  });

  test("tolerates leading blank lines before the banner", () => {
    expect(stripPageTitleBanner(`\n\n${banner}Body`, banner)).toBe("Body");
  });

  // A renamed title and the page's own first heading are indistinguishable from
  // here, so a DIFFERENT `# …` line falls through to the planner — which sees a
  // created heading and (once the acceptance predicate lands) refuses it.
  test("does NOT strip a different `# …` line", () => {
    const renamed = "# Renamed\n\nBody";
    expect(stripPageTitleBanner(renamed, banner)).toBe(renamed);
  });

  // The banner was never a row, so its absence deletes nothing: plan as-is.
  test("leaves a document with no banner untouched", () => {
    const noBanner = "Body line\n\nAnother";
    expect(stripPageTitleBanner(noBanner, banner)).toBe(noBanner);
  });

  // An edit that spliced across the banner is not byte-identical, so it takes
  // the same arm as a rename rather than this module guessing which half of the
  // mangled line was the title.
  test("does NOT strip a banner an edit ran into", () => {
    for (const mangled of [
      "# Design notesFOO\n\nBody",
      "# Design note\n\nBody",
      "#Design notes\n\nBody",
      "# Design notes extra\n\nBody",
    ]) {
      expect(stripPageTitleBanner(mangled, banner)).toBe(mangled);
    }
  });

  test("compares against THIS page's banner, not against a shape", () => {
    const other = pageTitleBanner("Some other page", ctx);
    expect(stripPageTitleBanner(`${other}Body`, banner)).toBe(`${other}Body`);
  });
});

// ---------------------------------------------------------------------------
// The round trip the banner exists inside: read → apply the same string back
// ---------------------------------------------------------------------------

const PAGE_ID = "PAGE";

interface RawNode {
  type: string;
  data: unknown;
  children: RawNode[];
}

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

const node = (type: string, s: string, children: RawNode[] = []): RawNode => ({
  type,
  data: { text: s ? [{ text: s }] : [] },
  children,
});

/** What a PAGE-rooted read returns: the banner, then the root's content. */
function readPage(rows: StoredRow[], title: string): string {
  return (
    pageTitleBanner(title, ctx) +
    serializeForestToMarkdown(markdownNodesOfRows(rows, PAGE_ID), ctx)
  );
}

/** What an apply does with a page-rooted document: strip, parse, plan. */
function applyPage(rows: StoredRow[], title: string, markdown: string) {
  return planMarkdownApply({
    rootId: PAGE_ID,
    pageId: PAGE_ID,
    existing: rows,
    incoming: parseMarkdownToForest(
      stripPageTitleBanner(markdown, pageTitleBanner(title, ctx)),
      ctx,
    ),
    handles,
  });
}

describe("the banner across a read → apply round trip", () => {
  test("feeding a page-rooted read straight back writes nothing", () => {
    const title = "Design notes";
    const rows = rowsOf([
      node("text", "The parser handles UTF-8."),
      node("heading-1", "Findings", [node("text", "Checked the writer.")]),
    ]);

    const result = applyPage(rows, title, readPage(rows, title));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isEmptyPatch(result.plan.patch)).toBe(true);
    expect(result.plan.textEdits).toEqual([]);
  });

  // The banner does not shadow a page whose own first block is an H1 reading the
  // same words: the strip takes exactly ONE line, so the block survives.
  test("a first-block H1 identical to the title survives the round trip", () => {
    const title = "Design notes";
    const rows = rowsOf([
      node("heading-1", "Design notes"),
      node("text", "Body."),
    ]);

    const markdown = readPage(rows, title);
    expect(markdown).toBe("# Design notes\n\n# Design notes\nBody.");

    const result = applyPage(rows, title, markdown);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isEmptyPatch(result.plan.patch)).toBe(true);
  });

  // A title full of markdown metacharacters is literal text in the banner, so
  // the round trip is still an identity — the escaping is what makes it one.
  test("a title carrying markdown metacharacters still round-trips", () => {
    const title = "a * b `c` <d>";
    const rows = rowsOf([node("text", "Body.")]);

    const result = applyPage(rows, title, readPage(rows, title));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isEmptyPatch(result.plan.patch)).toBe(true);
  });

  // The failure this whole module exists to prevent, stated as a test: without
  // the strip, the page's own title arrives as a created heading block — and so
  // does the blank line after it, which is an empty paragraph now. Both belong
  // to the banner, which is exactly why `stripPageTitleBanner` consumes the
  // blank line rather than only the `# ` line.
  test("the banner WOULD become created blocks if it were not stripped", () => {
    const title = "Design notes";
    const rows = rowsOf([node("text", "Body.")]);

    const result = planMarkdownApply({
      rootId: PAGE_ID,
      pageId: PAGE_ID,
      existing: rows,
      incoming: parseMarkdownToForest(readPage(rows, title), ctx),
      handles,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.patch.creates.map((b) => b.type)).toEqual([
      "heading-1",
      "text",
    ]);
    expect(
      plainOf((result.plan.patch.creates[1]!.data as { text: unknown }).text),
    ).toBe("");
  });
});

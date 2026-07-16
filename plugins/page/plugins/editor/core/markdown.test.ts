import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineBlock, type BlockHandle } from "./define-block";
import { textBlockSchema, textDataSchema } from "./text-data";
import { plainOf, type RichText } from "./rich-text";
import type { SerializedBlock } from "./serialized-block";
import {
  parseMarkdownToForest,
  serializeForestToMarkdown,
  defaultTextHandle,
} from "./markdown";

// The orchestrator is parameterized on `BlockHandle[]`, so the test builds
// handles LOCALLY with the real `defineBlock` (mirroring the block plugins'
// declarations). Importing the block plugins' cores here would form a plugin
// import cycle (each imports the editor's `defineBlock`) — the boundary checker
// scans test files, so a local reconstruction is the boundary-legal way to
// exercise the real per-type `markdown` shape through the real orchestrator.

const text = defineBlock({
  type: "text",
  schema: textDataSchema,
  defaultText: true,
  empty: () => ({ text: [] }),
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
    serialize: (d, ctx) => `- [${d.checked ? "x" : " "}] ` + ctx.plain(d.text),
    parseLine: (line, ctx) => {
      const m = /^[-*+]?\s*\[([ xX])\]\s+(.*)$/.exec(line);
      if (!m) return null;
      return { text: ctx.runs(m[2]!), checked: m[1]!.toLowerCase() === "x" };
    },
  },
  markdownPrefixes: ["[] ", "[ ] "],
});

const numberedList = defineBlock({
  type: "numbered-list",
  schema: textDataSchema,
  empty: () => ({ text: [] }),
  markdown: {
    serialize: (d, ctx) => `${ctx.ordinal}. ` + ctx.plain(d.text),
    parseLine: (line, ctx) => {
      const m = /^\d+[.)]\s+(.*)$/.exec(line);
      return m ? { text: ctx.runs(m[1]!) } : null;
    },
  },
  markdownPrefixes: ["1. "],
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
});

const callout = defineBlock({
  type: "callout",
  schema: textBlockSchema({ color: z.enum(["default", "info"]).default("default") }),
  empty: () => ({ text: [], color: "default" as const }),
});

const codeBlock = defineBlock({
  type: "code-block",
  schema: z.object({ code: z.string().default(""), language: z.string().optional() }),
  empty: () => ({ code: "" }),
  markdown: {
    fence: {
      open: "```",
      close: "```",
      parseFenced: (info, body) => ({
        code: body,
        ...(info ? { language: info } : {}),
      }),
    },
    serialize: (d) => "```" + (d.language ?? "") + "\n" + d.code + "\n```",
  },
  markdownPrefixes: ["```"],
});

const equation = defineBlock({
  type: "equation",
  schema: z.object({ expression: z.string().default("") }),
  empty: () => ({ expression: "" }),
  markdown: {
    serialize: (d) => "$$" + d.expression,
    parseLine: (line) =>
      line.startsWith("$$") ? { expression: line.slice(2).trim() } : null,
  },
  markdownPrefixes: ["$$"],
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

// Registration order: bulleted-list BEFORE to-do, so a test that `- [ ] x` parses
// as a to-do proves `precedence` (not order) is what wins.
const handles: BlockHandle<unknown>[] = [
  text,
  bulletedList,
  heading1,
  toDo,
  numberedList,
  toggle,
  quote,
  callout,
  codeBlock,
  equation,
  divider,
] as BlockHandle<unknown>[];

const parse = (md: string): SerializedBlock[] => parseMarkdownToForest(md, handles);
const serialize = (forest: SerializedBlock[]): string =>
  serializeForestToMarkdown(forest, handles);

/** A leaf serialized block (no children). */
const node = (type: string, data: unknown): SerializedBlock => ({
  type,
  data,
  expanded: true,
  children: [],
});
const runs = (s: string): RichText => (s ? [{ text: s }] : []);
/** The parsed `text` field flattened to a plain string (parse emits runs). */
const dataText = (b: SerializedBlock): string => plainOf((b.data as { text?: unknown }).text);

describe("defaultTextHandle", () => {
  test("selects the block declaring `defaultText`", () => {
    expect(defaultTextHandle(handles)).toBe(text as BlockHandle<unknown>);
  });
});

describe("plain paragraphs", () => {
  test("parse → default text type with runs", () => {
    const forest = parse("hello world");
    expect(forest).toHaveLength(1);
    expect(forest[0]!.type).toBe("text");
    expect(dataText(forest[0]!)).toBe("hello world");
  });

  test("serialize a text block emits the bare line", () => {
    expect(serialize([node("text", { text: runs("hello") })])).toBe("hello");
  });

  test("blank lines are skipped on parse", () => {
    const forest = parse("a\n\n\nb");
    expect(forest.map((b) => b.type)).toEqual(["text", "text"]);
    expect(forest.map(dataText)).toEqual(["a", "b"]);
  });
});

describe("headings", () => {
  test("parse `# ` prefix → heading-1", () => {
    const forest = parse("# Title");
    expect(forest[0]!.type).toBe("heading-1");
    expect(dataText(forest[0]!)).toBe("Title");
  });

  test("serialize heading-1 → `# ` prefix", () => {
    expect(serialize([node("heading-1", { text: runs("Title") })])).toBe("# Title");
  });
});

describe("bulleted list", () => {
  test("parses all three CommonMark markers", () => {
    const forest = parse("* a\n- b\n+ c");
    expect(forest.map((b) => b.type)).toEqual([
      "bulleted-list",
      "bulleted-list",
      "bulleted-list",
    ]);
    expect(forest.map(dataText)).toEqual(["a", "b", "c"]);
  });

  test("serializes with the single canonical `* ` prefix", () => {
    expect(serialize([node("bulleted-list", { text: runs("a") })])).toBe("* a");
  });
});

describe("to-do (precedence over bulleted list)", () => {
  test("`- [ ] x` parses as an UNCHECKED to-do, not a bullet", () => {
    const forest = parse("- [ ] task");
    expect(forest[0]!.type).toBe("to-do");
    expect(dataText(forest[0]!)).toBe("task");
    expect((forest[0]!.data as { checked: boolean }).checked).toBe(false);
  });

  test("`- [x] x` parses as a CHECKED to-do", () => {
    const forest = parse("- [x] done");
    expect(forest[0]!.type).toBe("to-do");
    expect((forest[0]!.data as { checked: boolean }).checked).toBe(true);
  });

  test("a plain `- item` still parses as a bullet", () => {
    expect(parse("- item")[0]!.type).toBe("bulleted-list");
  });

  test("serialize both states", () => {
    expect(serialize([node("to-do", { text: runs("a"), checked: false })])).toBe(
      "- [ ] a",
    );
    expect(serialize([node("to-do", { text: runs("a"), checked: true })])).toBe(
      "- [x] a",
    );
  });
});

describe("numbered list", () => {
  test("parses `1.` / `2)` discarding the literal number", () => {
    const forest = parse("1. one\n2) two");
    expect(forest.map((b) => b.type)).toEqual(["numbered-list", "numbered-list"]);
    expect(forest.map(dataText)).toEqual(["one", "two"]);
  });

  test("serialize numbers sequentially and resets per nesting level", () => {
    const forest: SerializedBlock[] = [
      {
        type: "numbered-list",
        data: { text: runs("one") },
        expanded: true,
        children: [
          node("numbered-list", { text: runs("nested-a") }),
          node("numbered-list", { text: runs("nested-b") }),
        ],
      },
      node("numbered-list", { text: runs("two") }),
    ];
    expect(serialize(forest)).toBe(
      ["1. one", "  1. nested-a", "  2. nested-b", "2. two"].join("\n"),
    );
  });
});

describe("toggle", () => {
  test("round-trips the `> ` prefix", () => {
    const forest = parse("> collapsible");
    expect(forest[0]!.type).toBe("toggle");
    expect(dataText(forest[0]!)).toBe("collapsible");
    expect(serialize([node("toggle", { text: runs("collapsible") })])).toBe(
      "> collapsible",
    );
  });
});

describe("code fence", () => {
  test("parses a multi-line fenced block with a language info string", () => {
    const forest = parse("```ts\nconst x = 1;\nconst y = 2;\n```");
    expect(forest).toHaveLength(1);
    expect(forest[0]!.type).toBe("code-block");
    expect(forest[0]!.data).toEqual({ code: "const x = 1;\nconst y = 2;", language: "ts" });
  });

  test("no info string ⇒ no language key", () => {
    const forest = parse("```\nplain\n```");
    expect(forest[0]!.data).toEqual({ code: "plain" });
  });

  test("serialize round-trips code + language", () => {
    expect(serialize([node("code-block", { code: "a\nb", language: "ts" })])).toBe(
      "```ts\na\nb\n```",
    );
  });
});

describe("equation", () => {
  test("`$$expr` parses into `expression` (never `text`)", () => {
    const forest = parse("$$x^2 + 1");
    expect(forest[0]!.type).toBe("equation");
    expect(forest[0]!.data).toEqual({ expression: "x^2 + 1" });
    expect("text" in (forest[0]!.data as object)).toBe(false);
  });

  test("serialize reads `expression`", () => {
    expect(serialize([node("equation", { expression: "x^2" })])).toBe("$$x^2");
  });
});

describe("divider (void — no text key)", () => {
  test("`---` parses to an empty payload with NO `text` key", () => {
    const forest = parse("---");
    expect(forest[0]!.type).toBe("divider");
    expect(forest[0]!.data).toEqual({});
    expect("text" in (forest[0]!.data as object)).toBe(false);
  });

  test("serialize emits `---`", () => {
    expect(serialize([node("divider", {})])).toBe("---");
  });
});

describe("nested indentation → tree", () => {
  test("two spaces of indent nest as children", () => {
    const forest = parse("- a\n  - b\n  - c\n- d");
    expect(forest).toHaveLength(2);
    expect(dataText(forest[0]!)).toBe("a");
    expect(forest[0]!.children.map(dataText)).toEqual(["b", "c"]);
    expect(dataText(forest[1]!)).toBe("d");
    expect(forest[1]!.children).toHaveLength(0);
  });
});

describe("quote / callout serialize as plain text", () => {
  test("quote has no prefix", () => {
    expect(serialize([node("quote", { text: runs("wisdom") })])).toBe("wisdom");
  });

  test("callout has no prefix", () => {
    expect(
      serialize([node("callout", { text: runs("note"), color: "default" })]),
    ).toBe("note");
  });
});

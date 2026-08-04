import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { conversionPrefixesOf, defineBlock, type BlockHandle } from "./define-block";
import { textBlockSchema, textDataSchema } from "./text-data";
import { plainOf, runsLength, type RichText } from "./rich-text";
import type { SerializedBlock } from "./serialized-block";
import {
  parseMarkdownToForest,
  serializeForestToMarkdown,
  defaultTextHandle,
  type MarkdownContext,
  type MarkdownNode,
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
  // An EMPTY paragraph gets `<text/>`; anything else is ordinary prose. The tag
  // is parse-only here (`serialize` wins on the way out).
  markdown: {
    serialize: (d, ctx) => (runsLength(d.text) === 0 ? "<text/>" : ctx.md(d.text)),
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
  typingPrefixes: ["[] ", "[ ] "],
});

const numberedList = defineBlock({
  type: "numbered-list",
  schema: textDataSchema,
  empty: () => ({ text: [] }),
  markdown: {
    serialize: (d, ctx) => `${ctx.ordinal}. ` + ctx.md(d.text),
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

// `quote` declares NO `markdownPrefixes` — the canonical `> ` belongs to
// `toggle` — so without a tag it serialized as a bare paragraph and came back as
// `text`. `body: "text"` is the fix, and `prompt` (no prefix either) is the same
// shape. Its `| ` is a `typingPrefixes` entry, which the clipboard pipeline
// never reads: `| ` is a markdown TABLE ROW.
const quote = defineBlock({
  type: "quote",
  schema: textDataSchema,
  empty: () => ({ text: [] }),
  typingPrefixes: ["| "],
  markdown: { tag: { body: "text" } },
});

const prompt = defineBlock({
  type: "prompt",
  schema: textDataSchema,
  empty: () => ({ text: [] }),
  markdown: { tag: { body: "text" } },
});

// A VOID container, exactly as the real callout is: appearance only, its content
// IS its children — and it declares NO markdown at all, so it exercises the
// DERIVED tag (the branch that used to emit a blank line).
const callout = defineBlock({
  type: "callout",
  schema: z.object({
    icon: z.string().nullable().default(null),
    iconSvgNodes: z.array(z.object({ tag: z.string() })).nullable().default(null),
    color: z.enum(["default", "info"]).default("default"),
  }),
  empty: () => ({ icon: null, iconSvgNodes: null, color: "default" as const }),
  anchor: true,
});

// The four annotation containers' shape: a void container with an explicit tag.
const context = defineBlock({
  type: "context",
  schema: z.object({}),
  empty: () => ({}),
  anchor: true,
  typingPrefixes: ["TODO "],
  markdown: { tag: { body: "children" } },
});

// The media/void family — no markdown declaration anywhere, all covered by the
// derived tag. `image` carries a non-string field (`width`), which is what the
// JSON `data` attribute exists for.
const image = defineBlock({
  type: "image",
  schema: z.object({
    attachmentId: z.string().optional(),
    width: z.number().int().positive().optional(),
    alt: z.string().optional(),
  }),
  empty: () => ({}),
});

const video = defineBlock({
  type: "video",
  schema: z.object({ attachmentId: z.string().optional(), mime: z.string().optional() }),
  empty: () => ({}),
});

const audio = defineBlock({
  type: "audio",
  schema: z.object({ attachmentId: z.string().optional(), mime: z.string().optional() }),
  empty: () => ({}),
});

const file = defineBlock({
  type: "file",
  schema: z.object({
    attachmentId: z.string().optional(),
    filename: z.string().optional(),
    size: z.number().optional(),
  }),
  empty: () => ({}),
});

const embed = defineBlock({
  type: "embed",
  schema: z.object({ url: z.string().optional() }),
  empty: () => ({}),
});

const bookmark = defineBlock({
  type: "bookmark",
  schema: z.object({
    url: z.string().optional(),
    title: z.string().optional(),
    fetched: z.boolean().optional(),
    attachmentIds: z.array(z.string()).optional(),
  }),
  empty: () => ({}),
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
  typingPrefixes: ["```"],
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
  typingPrefixes: ["$$"],
});

const divider = defineBlock({
  type: "divider",
  schema: z.object({}),
  empty: () => ({}),
  markdown: {
    serialize: () => "---",
    parseLine: (line) => (line.trim() === "---" ? {} : null),
  },
  typingPrefixes: ["---"],
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
  prompt,
  callout,
  context,
  codeBlock,
  equation,
  divider,
  image,
  video,
  audio,
  file,
  embed,
  bookmark,
  page,
  pageLink,
] as BlockHandle<unknown>[];

// No token extensions in the pure suite: `protectedSpans` is exercised directly
// in `inline-markdown.test.ts`, where the masking rule lives.
const mdCtx: MarkdownContext = { handles, protectedSpans: [] };
const parse = (md: string): SerializedBlock[] => parseMarkdownToForest(md, mdCtx);
const serialize = (forest: SerializedBlock[]): string =>
  serializeForestToMarkdown(forest, mdCtx);

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

  test("a NESTED fence round-trips byte-identically (the dedent fix)", () => {
    // The serializer indents every line of a multi-line block by its depth, so a
    // fence two levels deep arrives at the parser with four columns of leading
    // whitespace on every body line. Pushing the body raw made the code accrete
    // two spaces per cycle — invisible in one round trip, corrupting in a loop.
    const forest: SerializedBlock[] = [
      {
        type: "bulleted-list",
        data: { text: runs("outer") },
        expanded: true,
        children: [
          {
            type: "bulleted-list",
            data: { text: runs("inner") },
            expanded: true,
            children: [node("code-block", { code: "const x = 1;\nreturn x;", language: "ts" })],
          },
        ],
      },
    ];
    const md = serialize(forest);
    expect(md).toBe(
      [
        "* outer",
        "  * inner",
        "    ```ts",
        "    const x = 1;",
        "    return x;",
        "    ```",
      ].join("\n"),
    );
    expect(parse(md)).toEqual(forest);
    // Idempotent, which is the property the raw push broke.
    expect(serialize(parse(md))).toBe(md);
  });

  test("dedent strips UP TO the fence's indent, never more", () => {
    // Genuine leading whitespace inside the code survives: the second body line
    // is indented four columns beyond the fence's own two.
    const md = ["  ```py", "  def f():", "      return 1", "  ```"].join("\n");
    expect(parse(md)[0]!.data).toEqual({ code: "def f():\n    return 1", language: "py" });
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

describe("quote / prompt (text-bearing, no prefix of their own)", () => {
  test("quote round-trips through its own tag instead of decaying to `text`", () => {
    // WAS: `serialize` emitted the bare line "wisdom", which parsed back as a
    // `text` block — a silent type loss on every cycle.
    const md = serialize([node("quote", { text: runs("wisdom") })]);
    expect(md).toBe("<quote>wisdom</quote>");
    expect(parse(md)).toEqual([node("quote", { text: runs("wisdom") })]);
  });

  test("prompt likewise", () => {
    const md = serialize([node("prompt", { text: runs("ship it") })]);
    expect(md).toBe("<prompt>ship it</prompt>");
    expect(parse(md)[0]!.type).toBe("prompt");
  });

  test("a `text` body carries inline marks, and children still nest below it", () => {
    const forest: SerializedBlock[] = [
      {
        type: "quote",
        data: { text: [{ text: "bold", marks: ["bold" as const] }] },
        expanded: true,
        children: [node("bulleted-list", { text: runs("under") })],
      },
    ];
    const md = serialize(forest);
    expect(md).toBe(["<quote>**bold**</quote>", "  * under"].join("\n"));
    expect(parse(md)).toEqual(forest);
  });

  test("leading/trailing whitespace in the text survives the single-line form", () => {
    // The inner text is VERBATIM: dedenting it (as the multi-line body form
    // does) would eat a space the text genuinely carries.
    const forest = [node("quote", { text: runs("  padded  ") })];
    expect(serialize(forest)).toBe("<quote>  padded  </quote>");
    expect(parse(serialize(forest))).toEqual(forest);
  });

  test("a soft line break inside the text uses the multi-line tag form", () => {
    const forest = [node("quote", { text: runs("a\nb") })];
    const md = serialize(forest);
    expect(md).toBe(["<quote>", "  a", "  b", "</quote>"].join("\n"));
    expect(parse(md)).toEqual(forest);
  });
});

describe("the derived tag: the nine types that used to serialize to a blank line", () => {
  test("a callout keeps its appearance payload AND its children", () => {
    // WAS: `() => ""`. A callout, its tint and everything inside it vanished.
    const forest: SerializedBlock[] = [
      {
        type: "callout",
        data: { icon: "info", iconSvgNodes: [{ tag: "path" }], color: "info" },
        expanded: true,
        children: [node("text", { text: runs("Watch out.") })],
      },
    ];
    const md = serialize(forest);
    expect(md).toBe(
      [
        '<callout icon="info" color="info" data="{\\"iconSvgNodes\\":[{\\"tag\\":\\"path\\"}]}">',
        "  Watch out.",
        "</callout>",
      ].join("\n"),
    );
    expect(parse(md)).toEqual(forest);
  });

  test("string fields are plain attributes; everything else is the JSON `data` blob", () => {
    // An attribute value is a string BOTH ways, so `width="640"` would read back
    // as the string "640" — indistinguishable from a genuinely-string field.
    const forest = [node("image", { attachmentId: "att_9f2", width: 640, alt: "a cat" })];
    expect(serialize(forest)).toBe(
      '<image attachmentId="att_9f2" alt="a cat" data="{\\"width\\":640}"/>',
    );
    expect(parse(serialize(forest))).toEqual(forest);
  });

  test("an empty payload is a bare self-closing tag", () => {
    expect(serialize([node("video", {})])).toBe("<video/>");
    expect(parse("<video/>")).toEqual([node("video", {})]);
  });

  test("every previously-dropped type survives a round trip", () => {
    const forest: SerializedBlock[] = [
      node("callout", { icon: null, iconSvgNodes: null, color: "default" }),
      node("image", { attachmentId: "a1" }),
      node("video", { attachmentId: "a2", mime: "video/mp4" }),
      node("audio", { attachmentId: "a3", mime: "audio/mpeg" }),
      node("file", { attachmentId: "a4", filename: "notes.pdf", size: 12 }),
      node("embed", { url: "https://example.com/e" }),
      node("bookmark", {
        url: "https://example.com",
        title: "Example",
        fetched: true,
        attachmentIds: ["i1", "f1"],
      }),
      node("page-link", { pageId: "p1" }),
    ];
    expect(parse(serialize(forest))).toEqual(forest);
  });

  test("attribute values carrying quotes, backslashes and newlines survive", () => {
    const forest = [node("bookmark", { title: 'he said "hi"\\ \n bye' })];
    expect(parse(serialize(forest))).toEqual(forest);
  });
});

describe("annotation containers (a real syntax, not a one-way marker)", () => {
  test("children go INSIDE the tag and come back as the same container", () => {
    const forest: SerializedBlock[] = [
      {
        type: "context",
        data: {},
        expanded: true,
        children: [
          node("heading-1", { text: runs("Conventions") }),
          node("bulleted-list", { text: runs("always run X") }),
        ],
      },
    ];
    const md = serialize(forest);
    expect(md).toBe(
      ["<context>", "  # Conventions", "  * always run X", "</context>"].join("\n"),
    );
    expect(parse(md)).toEqual(forest);
  });

  test("containers nest, depth-counted on the same tag name", () => {
    const forest: SerializedBlock[] = [
      {
        type: "context",
        data: {},
        expanded: true,
        children: [
          {
            type: "context",
            data: {},
            expanded: true,
            children: [node("text", { text: runs("inner") })],
          },
          node("text", { text: runs("outer tail") }),
        ],
      },
    ];
    expect(parse(serialize(forest))).toEqual(forest);
  });

  test("a FENCED body inside a container is opaque to the close scan", () => {
    // The code below contains the container's own closing tag. It is code, not
    // structure, so the scan must skip fenced regions or the container closes
    // early and the rest of its content spills out.
    const forest: SerializedBlock[] = [
      {
        type: "context",
        data: {},
        expanded: true,
        children: [
          node("code-block", { code: 'print("</context>")', language: "py" }),
          node("text", { text: runs("after the code") }),
        ],
      },
    ];
    expect(parse(serialize(forest))).toEqual(forest);
  });

  test("a container's `typingPrefixes` are invisible to the parser — `TODO ` in prose is prose", () => {
    // Nothing in this module reads `typingPrefixes`, and the tag pass keys on
    // the tag NAME. So a pasted line that happens to start with the wrap trigger
    // stays a paragraph.
    const forest = parse("TODO write the docs");
    expect(forest[0]!.type).toBe("text");
    expect(dataText(forest[0]!)).toBe("TODO write the docs");
  });
});

// ---------------------------------------------------------------------------
// A typing shortcut is NOT markdown line syntax
// ---------------------------------------------------------------------------
//
// The executable statement of why `BlockHandle` carries two prefix fields. Every
// case below is a prefix a user can TYPE to convert a block, whose markdown
// meaning is something else entirely (or nothing at all) — so the clipboard
// pipeline must not claim it.

describe("typingPrefixes never reach the markdown pipeline", () => {
  test("a markdown TABLE body does not become quote blocks", () => {
    // `quote` converts on a typed `| `, which is exactly a table row's opening
    // in markdown. Had `| ` been a `markdownPrefixes` entry, `derivedParsePrefixes`
    // would claim both lines and the pasted table would arrive as two quotes with
    // the pipes eaten. Tables have no block type yet, so the honest answer is
    // prose — verbatim, so nothing is lost.
    const forest = parse(["| a | b |", "| - | - |"].join("\n"));
    expect(forest.map((b) => b.type)).toEqual(["text", "text"]);
    expect(forest.map(dataText)).toEqual(["| a | b |", "| - | - |"]);
  });

  test("`| ` is a conversion prefix but not a markdown one", () => {
    expect(conversionPrefixesOf(quote as BlockHandle<unknown>)).toEqual(["| "]);
    expect(quote.markdownPrefixes).toBeUndefined();
  });

  test("markdown syntax is ALSO a typing shortcut — the union is a superset", () => {
    // A `markdownPrefixes` entry needs no restating: anything the parser claims
    // is by definition something the user can type.
    expect(conversionPrefixesOf(bulletedList as BlockHandle<unknown>)).toEqual([
      "* ",
      "- ",
      "+ ",
    ]);
    // …while a type carrying only input-only entries hands back exactly those.
    expect(conversionPrefixesOf(toDo as BlockHandle<unknown>)).toEqual(["[] ", "[ ] "]);
    // Ordering when a type declares BOTH: markdown syntax first, input-only after.
    const both = defineBlock({
      type: "both",
      schema: textDataSchema,
      empty: () => ({ text: [] }),
      markdownPrefixes: ["# "],
      typingPrefixes: ["! "],
    });
    expect(conversionPrefixesOf(both as BlockHandle<unknown>)).toEqual(["# ", "! "]);
  });

  test("a to-do's `[] ` shorthand is typing-only: pasted, it stays prose", () => {
    // The markdown task-list syntax is `- [ ] `, which `to-do`'s own `parseLine`
    // owns. The bare `[] ` shorthand exists for the keyboard alone.
    const forest = parse("[] buy milk");
    expect(forest[0]!.type).toBe("text");
    expect(dataText(forest[0]!)).toBe("[] buy milk");
  });
});

describe("page tags", () => {
  const identified = (
    id: string,
    type: string,
    data: unknown,
    children: MarkdownNode[] = [],
    expanded = true,
  ): MarkdownNode => ({ id, type, data, expanded, children });

  test("an EXPANDED sub-page emits its children; a COLLAPSED one self-closes", () => {
    const data = { title: "Sub", icon: null };
    const child = identified("c1", "text", { text: runs("inside") });
    expect(
      serializeForestToMarkdown([identified("p1", "page", data, [child])], mdCtx),
    ).toBe(['<page id="p1">', "  inside", "</page>"].join("\n"));
    expect(
      serializeForestToMarkdown([identified("p1", "page", data, [child], false)], mdCtx),
    ).toBe('<page id="p1"/>');
  });

  test("`expanded` is a page-tag rule ONLY — a collapsed toggle still emits its children", () => {
    const forest: SerializedBlock[] = [
      {
        type: "toggle",
        data: { text: runs("folded") },
        expanded: false,
        children: [node("text", { text: runs("hidden but copied") })],
      },
    ];
    expect(serialize(forest)).toBe(["> folded", "  hidden but copied"].join("\n"));
  });

  test("a sub-page needs its row id — an id-less forest fails LOUDLY", () => {
    expect(() => serialize([node("page", { title: "Sub", icon: null })])).toThrow(
      /needs its row id/,
    );
  });

  test("markdown parse alone can never mint a sub-page: `<page/>` is a page-link", () => {
    expect(parse('<page id="p1"/>')).toEqual([node("page-link", { pageId: "p1" })]);
  });

  test("a BODY on a parsed page tag is a loud rejection, never a silent drop", () => {
    expect(() => parse(['<page id="p1">', "  smuggled", "</page>"].join("\n"))).toThrow(
      /takes no body/,
    );
    expect(() => parse('<page id="p1"></page>')).toThrow(/takes no body/);
  });

  test("a page tag with no id is a loud rejection", () => {
    expect(() => parse("<page/>")).toThrow(/needs an `id`/);
  });
});

describe("empty paragraphs", () => {
  test("an empty text block emits `<text/>` and comes back", () => {
    const forest = [node("text", { text: [] })];
    expect(serialize(forest)).toBe("<text/>");
    expect(parse("<text/>")).toEqual(forest);
  });

  test("a blank LINE is still skipped on parse — the asymmetry is deliberate", () => {
    // What this codebase emits round-trips; what a user pastes stays lenient
    // (blank-line-skipping is correct CommonMark for foreign markdown).
    expect(parse("a\n\nb").map((b) => b.type)).toEqual(["text", "text"]);
  });
});

describe("tag leniency: an unregistered or malformed tag is prose", () => {
  test("an unknown tag name stays text", () => {
    const forest = parse("<div>hello</div>");
    expect(forest[0]!.type).toBe("text");
    expect(dataText(forest[0]!)).toBe("<div>hello</div>");
  });

  test("an UNTERMINATED registered tag stays text rather than swallowing the document", () => {
    // The claim is DECLINED (there is no `</context>`), so the line falls
    // through to prose and the indented lines nest under it as ordinary
    // indentation would — never a container that runs to the end of the file.
    const forest = parse("<context>\n  a\n  b");
    expect(forest).toHaveLength(1);
    expect(forest[0]!.type).toBe("text");
    expect(dataText(forest[0]!)).toBe("<context>");
    expect(forest[0]!.children.map(dataText)).toEqual(["a", "b"]);
  });

  test("a paragraph that genuinely begins with `<` is escaped on the way out", () => {
    const forest = [node("text", { text: runs("<context> is a tag") })];
    expect(serialize(forest)).toBe("\\<context> is a tag");
    expect(parse(serialize(forest))).toEqual(forest);
  });
});

// ---------------------------------------------------------------------------
// The round-trip property: markdown is a LOSSLESS PROJECTION of the forest
// ---------------------------------------------------------------------------
//
// `parse(serialize(forest)) ≡ forest`, structurally, over a fuzzed forest. This
// is the assertion that actually encodes the goal — the one that would have
// caught the fence-indentation drift, and the one a NEW block type has to keep
// passing. Two deliberate exclusions, both stated as their own tests above:
//
//  - `page`, which is asymmetric BY DESIGN (it serializes, `page-link` parses);
//  - `expanded: false`, since markdown ignores the fold and every creation path
//    mints `expanded: true` ("a block is born expanded").

describe("round-trip property (fuzzed forest)", () => {
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

  // Words chosen so no generated line can be claimed by a PREFIX parser: nothing
  // starts with `- `, `# `, `1. `, `> `, `$$`, `---`, `[ ] ` or a space. That is
  // a genuine (pre-existing) lossiness of markdown itself — a paragraph reading
  // "- x" is a bullet — not of this mechanism.
  const words = ["alpha", "bravo", "charlie", "delta*star", "echo_under", "foxtrot<lt"];

  const gens: {
    type: string;
    data(r: () => number): unknown;
    children: boolean;
  }[] = [
    { type: "text", data: (r) => ({ text: pick(r) }), children: true },
    { type: "text", data: () => ({ text: [] }), children: true },
    { type: "bulleted-list", data: (r) => ({ text: pick(r) }), children: true },
    { type: "heading-1", data: (r) => ({ text: pick(r) }), children: true },
    { type: "numbered-list", data: (r) => ({ text: pick(r) }), children: true },
    { type: "toggle", data: (r) => ({ text: pick(r) }), children: true },
    { type: "quote", data: (r) => ({ text: pick(r) }), children: true },
    { type: "prompt", data: (r) => ({ text: pick(r) }), children: true },
    {
      type: "to-do",
      data: (r) => ({ text: pick(r), checked: r() < 0.5 }),
      children: true,
    },
    { type: "divider", data: () => ({}), children: true },
    {
      type: "code-block",
      data: (r) => ({
        code: `const x = ${Math.floor(r() * 100)};\nreturn x;`,
        ...(r() < 0.5 ? { language: "ts" } : {}),
      }),
      children: true,
    },
    { type: "equation", data: (r) => ({ expression: `x^${Math.floor(r() * 9)}` }), children: true },
    {
      type: "callout",
      data: (r) => ({
        icon: r() < 0.5 ? null : "info",
        iconSvgNodes: r() < 0.5 ? null : [{ tag: "path" }],
        color: r() < 0.5 ? ("default" as const) : ("info" as const),
      }),
      children: true,
    },
    { type: "context", data: () => ({}), children: true },
    {
      type: "image",
      data: (r) => ({
        attachmentId: `att_${Math.floor(r() * 1000)}`,
        ...(r() < 0.5 ? { width: 320 + Math.floor(r() * 640) } : {}),
        ...(r() < 0.5 ? { alt: "a cat" } : {}),
      }),
      children: true,
    },
    { type: "video", data: (r) => ({ attachmentId: `v_${Math.floor(r() * 99)}` }), children: true },
    { type: "audio", data: (r) => ({ attachmentId: `s_${Math.floor(r() * 99)}` }), children: true },
    {
      type: "file",
      data: (r) => ({ filename: "notes.pdf", size: Math.floor(r() * 5000) }),
      children: true,
    },
    { type: "embed", data: () => ({ url: "https://example.com/e" }), children: true },
    {
      type: "bookmark",
      data: (r) => ({
        url: "https://example.com",
        ...(r() < 0.5 ? { title: 'a "quoted" title' } : {}),
        ...(r() < 0.5 ? { fetched: true } : {}),
        ...(r() < 0.5 ? { attachmentIds: ["i1", "f1"] } : {}),
      }),
      children: true,
    },
    // `page-link` is a POINTER: its body is `"none"`, so it never carries
    // children (they belong to the page it points at, not to this document).
    { type: "page-link", data: (r) => ({ pageId: `p${Math.floor(r() * 99)}` }), children: false },
  ];

  function pick(r: () => number): RichText {
    const n = 1 + Math.floor(r() * 3);
    const parts: string[] = [];
    for (let i = 0; i < n; i++) parts.push(words[Math.floor(r() * words.length)]!);
    const marks = r() < 0.25 ? ["bold" as const] : r() < 0.4 ? ["italic" as const] : undefined;
    return [{ text: parts.join(" "), ...(marks ? { marks } : {}) }];
  }

  const build = (r: () => number, depth: number): SerializedBlock => {
    const gen = gens[Math.floor(r() * gens.length)]!;
    const kids: SerializedBlock[] = [];
    if (gen.children && depth < 3) {
      const n = Math.floor(r() * (depth === 0 ? 3 : 2));
      for (let i = 0; i < n; i++) kids.push(build(r, depth + 1));
    }
    return { type: gen.type, data: gen.data(r), expanded: true, children: kids };
  };

  test("parse(serialize(forest)) === forest, over 400 seeds", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const r = rng(seed);
      const forest: SerializedBlock[] = [];
      const roots = 1 + Math.floor(r() * 4);
      for (let i = 0; i < roots; i++) forest.push(build(r, 0));
      const md = serialize(forest);
      expect({ seed, forest: parse(md) }).toEqual({ seed, forest });
      // Idempotence: the emitted document is CANONICAL, so a second cycle is a
      // fixed point (the property the fence-indent bug broke).
      expect({ seed, md: serialize(parse(md)) }).toEqual({ seed, md });
    }
  });
});

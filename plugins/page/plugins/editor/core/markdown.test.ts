import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  conversionPrefixesOf,
  defineBlock,
  type BlockHandle,
} from "./define-block";
import { textBlockSchema, textDataSchema } from "./text-data";
import { plainOf, runsLength, type RichText } from "./rich-text";
import type { SerializedBlock } from "./serialized-block";
import { withMintedIds } from "./serialized-block";
import {
  parseMarkdownToForest,
  serializeForestToMarkdown,
  defaultTextHandle,
  markdownTagIsIdentified,
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
  // An EMPTY paragraph is a blank line; anything else is ordinary prose. The tag
  // is parse-only here (`serialize` wins on the way out), and stays so that
  // `<text/>` — every document written before the blank-line dialect — keeps
  // parsing. Mirrors `page/text`'s real declaration.
  markdown: {
    serialize: (d, ctx) => (runsLength(d.text) === 0 ? "" : ctx.md(d.text)),
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

// `quote` is a VOID CONTAINER (the real one goes through
// `defineContainerBlock`): the quoted passage IS its children, so its tag
// carries THEM. It declares no `markdownPrefixes` — the canonical `> ` belongs
// to `toggle` — and its `| ` is a `typingPrefixes` entry, which the clipboard
// pipeline never reads: `| ` is a markdown TABLE ROW.
const quote = defineBlock({
  type: "quote",
  schema: z.object({}),
  empty: () => ({}),
  anchor: true,
  typingPrefixes: ["| "],
  markdown: { tag: { body: "children" } },
});

// `prompt` is now the ONLY text-bearing type with no markdown prefix of its own,
// so without a tag it serialized as a bare paragraph and came back as `text`.
// `body: "text"` is the fix.
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
    iconSvgNodes: z
      .array(z.object({ tag: z.string() }))
      .nullable()
      .default(null),
    color: z.enum(["default", "info"]).default("default"),
  }),
  empty: () => ({ icon: null, iconSvgNodes: null, color: "default" as const }),
  anchor: true,
});

// The four annotation containers' shape: a void container with an explicit tag.
// All four are present, because they are what the identified-tag property below
// runs over — three plain, one `identified`, so every assertion has both arms.
const context = defineBlock({
  type: "context",
  schema: z.object({}),
  empty: () => ({}),
  anchor: true,
  typingPrefixes: ["TODO "],
  markdown: { tag: { body: "children" } },
});

const privateNotes = defineBlock({
  type: "private-notes",
  schema: z.object({}),
  empty: () => ({}),
  anchor: true,
  markdown: { tag: { body: "children" } },
});

// The ONE annotated type, mirroring the real `todo`: a card an agent can be
// dispatched from, whose linked task and that task's status live in ANOTHER
// table. Neither is in `data` (which is `z.object({})` and stays so), so the two
// attributes are supplied to the serialize walk and reserved on the way back in.
const todo = defineBlock({
  type: "todo",
  schema: z.object({}),
  empty: () => ({}),
  anchor: true,
  markdown: { tag: { body: "children", annotated: ["task_id", "status"] } },
});

// The ONE identified type: `<agent-notes id="…">` carries the row it addresses,
// because it is the one card an agent may write back to and an edit therefore
// has to be able to NAME it. Everything else in this file — its sibling
// annotations included — is content-addressed, which is exactly the contrast the
// property test needs.
const agentNotes = defineBlock({
  type: "agent-notes",
  schema: z.object({}),
  empty: () => ({}),
  anchor: true,
  markdown: { tag: { body: "children", identified: true } },
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
  schema: z.object({
    attachmentId: z.string().optional(),
    mime: z.string().optional(),
  }),
  empty: () => ({}),
});

const audio = defineBlock({
  type: "audio",
  schema: z.object({
    attachmentId: z.string().optional(),
    mime: z.string().optional(),
  }),
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
        if (ctx.id === undefined)
          throw new Error("a `page` block needs its row id");
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
        if (id === undefined || id === "")
          throw new Error("<page/> needs an `id`");
        return { pageId: id };
      },
    },
  },
});

const codeBlock = defineBlock({
  type: "code-block",
  schema: z.object({
    code: z.string().default(""),
    language: z.string().optional(),
  }),
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
  privateNotes,
  todo,
  agentNotes,
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
//
// The default dialect here is OUR OWN (`"empty-block"`), because that is the
// document the round-trip property is about — what this codebase emits is what
// it must read back. `pasteCtx` is the other half of the asymmetry, for the
// tests that assert a pasted foreign document is unchanged by it.
const mdCtx: MarkdownContext = {
  handles,
  protectedSpans: [],
  blankLines: "empty-block",
};
const pasteCtx: MarkdownContext = { ...mdCtx, blankLines: "separator" };
const parse = (md: string): SerializedBlock[] =>
  parseMarkdownToForest(md, mdCtx);
const parsePasted = (md: string): SerializedBlock[] =>
  parseMarkdownToForest(md, pasteCtx);
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
const dataText = (b: SerializedBlock): string =>
  plainOf((b.data as { text?: unknown }).text);

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

  test("a blank line is an empty paragraph — one block per line, no counting", () => {
    const forest = parse("a\n\n\nb");
    expect(forest.map((b) => b.type)).toEqual(["text", "text", "text", "text"]);
    expect(forest.map(dataText)).toEqual(["a", "", "", "b"]);
  });

  test("under the paste dialect blank lines are still skipped", () => {
    // The lenient half of the contract, unchanged: in foreign markdown a blank
    // line separates paragraphs, so reading it as an empty paragraph would put
    // one between every two paragraphs of a pasted README.
    const forest = parsePasted("a\n\n\nb");
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
    expect(serialize([node("heading-1", { text: runs("Title") })])).toBe(
      "# Title",
    );
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
    expect(
      serialize([node("to-do", { text: runs("a"), checked: false })]),
    ).toBe("- [ ] a");
    expect(serialize([node("to-do", { text: runs("a"), checked: true })])).toBe(
      "- [x] a",
    );
  });
});

describe("numbered list", () => {
  test("parses `1.` / `2)` discarding the literal number", () => {
    const forest = parse("1. one\n2) two");
    expect(forest.map((b) => b.type)).toEqual([
      "numbered-list",
      "numbered-list",
    ]);
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
    expect(forest[0]!.data).toEqual({
      code: "const x = 1;\nconst y = 2;",
      language: "ts",
    });
  });

  test("no info string ⇒ no language key", () => {
    const forest = parse("```\nplain\n```");
    expect(forest[0]!.data).toEqual({ code: "plain" });
  });

  test("serialize round-trips code + language", () => {
    expect(
      serialize([node("code-block", { code: "a\nb", language: "ts" })]),
    ).toBe("```ts\na\nb\n```");
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
            children: [
              node("code-block", {
                code: "const x = 1;\nreturn x;",
                language: "ts",
              }),
            ],
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
    expect(parse(md)[0]!.data).toEqual({
      code: "def f():\n    return 1",
      language: "py",
    });
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

describe("prompt (text-bearing, no prefix of its own)", () => {
  test("prompt round-trips through its own tag instead of decaying to `text`", () => {
    // WAS: `serialize` emitted the bare line "ship it", which parsed back as a
    // `text` block — a silent type loss on every cycle.
    const md = serialize([node("prompt", { text: runs("ship it") })]);
    expect(md).toBe("<prompt>ship it</prompt>");
    expect(parse(md)).toEqual([node("prompt", { text: runs("ship it") })]);
  });

  test("a `text` body carries inline marks, and children still nest below it", () => {
    const forest: SerializedBlock[] = [
      {
        type: "prompt",
        data: { text: [{ text: "bold", marks: ["bold" as const] }] },
        expanded: true,
        children: [node("bulleted-list", { text: runs("under") })],
      },
    ];
    const md = serialize(forest);
    expect(md).toBe(["<prompt>**bold**</prompt>", "  * under"].join("\n"));
    expect(parse(md)).toEqual(forest);
  });

  test("leading/trailing whitespace in the text survives the single-line form", () => {
    // The inner text is VERBATIM: dedenting it (as the multi-line body form
    // does) would eat a space the text genuinely carries.
    const forest = [node("prompt", { text: runs("  padded  ") })];
    expect(serialize(forest)).toBe("<prompt>  padded  </prompt>");
    expect(parse(serialize(forest))).toEqual(forest);
  });

  test("a soft line break inside the text uses the multi-line tag form", () => {
    const forest = [node("prompt", { text: runs("a\nb") })];
    const md = serialize(forest);
    expect(md).toBe(["<prompt>", "  a", "  b", "</prompt>"].join("\n"));
    expect(parse(md)).toEqual(forest);
  });
});

describe("quote (a void container: its passage is its children)", () => {
  test("a quote carries its children inside its tag, not one line of text", () => {
    // The container model's whole point in markdown: a quoted LIST survives,
    // where the text-bearing form had exactly one line to carry.
    const forest: SerializedBlock[] = [
      {
        type: "quote",
        data: {},
        expanded: true,
        children: [
          node("text", { text: runs("wisdom") }),
          node("bulleted-list", { text: runs("and more") }),
        ],
      },
    ];
    const md = serialize(forest);
    expect(md).toBe(
      ["<quote>", "  wisdom", "  * and more", "</quote>"].join("\n"),
    );
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
    const forest = [
      node("image", { attachmentId: "att_9f2", width: 640, alt: "a cat" }),
    ];
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
      ["<context>", "  # Conventions", "  * always run X", "</context>"].join(
        "\n",
      ),
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
// The identified tag: an ADDRESSABLE region
// ---------------------------------------------------------------------------
//
// `markdown.tag.identified` carries the block's ROW id as the reserved `id`
// attribute, both ways: out of `ctx.id`, back onto `SerializedBlock.ref`. What
// it buys is a document whose reader can point at a card and be understood. What
// it must never do is let that id reach `data`, or reach the clipboard's
// id-minting path — the two failure modes each case below pins.

describe("identified tags (the row id, both ways)", () => {
  const withId = (
    id: string,
    type: string,
    data: unknown,
    children: MarkdownNode[] = [],
  ): MarkdownNode => ({ id, type, data, expanded: true, children });

  test("the row id is emitted as the FIRST attribute and comes back as `ref`", () => {
    const md = serializeForestToMarkdown(
      [
        withId("block-card", "agent-notes", {}, [
          withId("c1", "text", { text: runs("found it") }),
        ]),
      ],
      mdCtx,
    );
    expect(md).toBe(
      ['<agent-notes id="block-card">', "  found it", "</agent-notes>"].join(
        "\n",
      ),
    );
    expect(parse(md)).toEqual([
      {
        type: "agent-notes",
        data: {},
        expanded: true,
        ref: "block-card",
        children: [node("text", { text: runs("found it") })],
      },
    ]);
  });

  test("the id never lands in `data` — the card's payload stays void", () => {
    // The whole reason the attribute is lifted OFF the record before `dataOf`.
    // `z.object({})` would have STRIPPED it, leaving the tag decorative: the
    // document would say which card it means and nothing downstream would hear.
    const parsed = parse('<agent-notes id="block-card"/>')[0]!;
    expect(parsed.data).toEqual({});
    expect(parsed.ref).toBe("block-card");
  });

  test("an id-less card serializes BARE and parses with no `ref` key at all", () => {
    // The clipboard case, and the "mint me a card" case — one syntax, and it is
    // deliberately not an error the way an id-less `<page/>` is.
    const forest: SerializedBlock[] = [
      {
        type: "agent-notes",
        data: {},
        expanded: true,
        children: [node("text", { text: runs("fresh") })],
      },
    ];
    const md = serialize(forest);
    expect(md).toBe(["<agent-notes>", "  fresh", "</agent-notes>"].join("\n"));
    const parsed = parse(md);
    expect(parsed).toEqual(forest);
    // Structurally absent, not `ref: undefined` — `toEqual` would accept either.
    expect("ref" in parsed[0]!).toBe(false);
  });

  test("an EMPTY id is the same as no id", () => {
    const parsed = parse('<agent-notes id=""/>')[0]!;
    expect("ref" in parsed).toBe(false);
  });

  test("a non-identified sibling annotation carries no id, in or out", () => {
    // `identified` is opt-in per type, so `<context>` / `<todo>` /
    // `<private-notes>` stay content-addressed: the row id is not emitted…
    expect(
      serializeForestToMarkdown([withId("block-x", "context", {})], mdCtx),
    ).toBe("<context/>");
    // …and one written by hand is SILENTLY DROPPED by the void schema, yielding
    // no `ref`. That is exactly the failure `identified` exists to close, stated
    // as a fact rather than left to be rediscovered: without the opt-in the
    // attribute is decorative, and a card would be re-paired by content alone.
    const parsed = parse('<context id="block-x"/>')[0]!;
    expect(parsed.data).toEqual({});
    expect("ref" in parsed).toBe(false);
  });

  test("the identified type set is derivable from the registry, never named", () => {
    // What the markdown-apply planner reads, so it can pin a `ref` without ever
    // naming a block type (and so a rename cannot silently stop the pinning).
    expect(handles.filter(markdownTagIsIdentified).map((h) => h.type)).toEqual([
      "agent-notes",
    ]);
  });

  test("a handle declaring `identified` beside an `id` field is a LOUD failure", () => {
    // The derived projection would emit `data.id` under the reserved name, and
    // the row ref and the payload field would fight. Caught at resolution, which
    // is the first time anything serializes or parses this type.
    const clashing = defineBlock({
      type: "clashing",
      schema: z.object({ id: z.string() }),
      empty: () => ({ id: "" }),
      markdown: { tag: { body: "children", identified: true } },
    }) as BlockHandle<unknown>;
    expect(() => markdownTagIsIdentified(clashing)).toThrow(
      /reserves the `id` attribute/,
    );
  });

  test("minting ids ignores a node's `ref` — paste can never reuse a live row", () => {
    // `withMintedIds` is shared with clipboard paste. A card copied out of a page
    // and pasted back arrives carrying the ORIGINAL card's row id in `ref`; the
    // mint must still produce a fresh identity, and merely carry the ref through.
    const [minted] = withMintedIds(parse('<agent-notes id="block-card"/>'));
    expect(minted!.id).not.toBe("block-card");
    expect(minted!.ref).toBe("block-card");
  });
});

// ---------------------------------------------------------------------------
// Annotated tags: attributes whose value lives in ANOTHER table
// ---------------------------------------------------------------------------
//
// `markdown.tag.annotated` is `identified` generalized to a declared SET of
// names. What it buys is a document that can state a fact about a block the
// block does not own — a TODO card's linked task and that task's status — which
// no projection of `data` could produce. What it must never do is let one of
// those names reach `data` on the way back in, which is what makes the round
// trip closed: the same card, re-parsed, is byte-for-byte the card that was
// there before anything was dispatched from it.

describe("annotated tags (facts the block does not own)", () => {
  const annotated = (
    type: string,
    data: unknown,
    annotations: Record<string, string>,
    children: MarkdownNode[] = [],
    id?: string,
  ): MarkdownNode => ({
    ...(id === undefined ? {} : { id }),
    type,
    data,
    annotations,
    expanded: true,
    children,
  });

  test("annotations are emitted, and parse gives back the UN-annotated card", () => {
    const md = serializeForestToMarkdown(
      [
        annotated("todo", {}, { task_id: "task-7", status: "in_progress" }, [
          node("text", { text: runs("fix the parser") }),
        ]),
      ],
      mdCtx,
    );
    expect(md).toBe(
      [
        '<todo task_id="task-7" status="in_progress">',
        "  fix the parser",
        "</todo>",
      ].join("\n"),
    );
    // The attributes come OFF before `dataOf`, so the payload stays void — the
    // void `z.object({})` would otherwise have stripped them silently, and a
    // strict schema would have rejected a document this side emitted itself.
    const parsed = parse(md);
    expect(parsed).toEqual([
      {
        type: "todo",
        data: {},
        expanded: true,
        children: [node("text", { text: runs("fix the parser") })],
      },
    ]);
    // …which is byte-for-byte what the SAME card with no task parses to. That
    // equality is the point: dispatching an agent changes what the card SAYS
    // without changing what it IS, so the next apply reads no edit at all.
    expect(parsed).toEqual(
      parse(["<todo>", "  fix the parser", "</todo>"].join("\n")),
    );
  });

  test("reserved attributes come first: `id`, then annotations, then the type's own", () => {
    // One tag with all three sources, so the ORDER is pinned in one place rather
    // than inferred from two tags that each show half of it.
    const dispatchCard = defineBlock({
      type: "dispatch-card",
      schema: z.object({ label: z.string() }),
      empty: () => ({ label: "" }),
      markdown: {
        tag: {
          body: "children",
          identified: true,
          annotated: ["task_id", "status"],
        },
      },
    }) as BlockHandle<unknown>;
    const ctx: MarkdownContext = {
      handles: [...handles, dispatchCard],
      protectedSpans: [],
      blankLines: "empty-block",
    };
    const md = serializeForestToMarkdown(
      [
        annotated(
          "dispatch-card",
          { label: "ship it" },
          { task_id: "t1", status: "done" },
          [],
          "block-9",
        ),
      ],
      ctx,
    );
    expect(md).toBe(
      '<dispatch-card id="block-9" task_id="t1" status="done" label="ship it"/>',
    );
    expect(parseMarkdownToForest(md, ctx)).toEqual([
      {
        type: "dispatch-card",
        data: { label: "ship it" },
        expanded: true,
        ref: "block-9",
        children: [],
      },
    ]);
  });

  test("an absent value omits its attribute — a card nobody dispatched is bare", () => {
    // The clipboard case, and the ordinary case: a TODO with no task has no
    // task_id, and an empty attribute would be a lie about a row that does not
    // exist. Annotations are declared per TYPE, supplied per NODE.
    expect(serialize([node("todo", {})])).toBe("<todo/>");
    expect(
      serializeForestToMarkdown(
        [annotated("todo", {}, { status: "held" })],
        mdCtx,
      ),
    ).toBe('<todo status="held"/>');
  });

  test("an `annotated` name colliding with a schema field is a LOUD failure", () => {
    const clashing = defineBlock({
      type: "clashing-field",
      schema: z.object({ status: z.string() }),
      empty: () => ({ status: "" }),
      markdown: { tag: { body: "children", annotated: ["status"] } },
    }) as BlockHandle<unknown>;
    // `markdownTagIsIdentified` merely RESOLVES the tag — which is the first
    // thing any serialize or parse of this type does.
    expect(() => markdownTagIsIdentified(clashing)).toThrow(
      /reserves the `status` attribute/,
    );
  });

  test("`data` and (on an identified tag) `id` are reserved against annotations too", () => {
    const overData = defineBlock({
      type: "clashing-data",
      schema: z.object({}),
      empty: () => ({}),
      markdown: { tag: { body: "children", annotated: ["data"] } },
    }) as BlockHandle<unknown>;
    expect(() => markdownTagIsIdentified(overData)).toThrow(/JSON-encodes/);

    const overId = defineBlock({
      type: "clashing-id",
      schema: z.object({}),
      empty: () => ({}),
      markdown: {
        tag: { body: "children", identified: true, annotated: ["id"] },
      },
    }) as BlockHandle<unknown>;
    expect(() => markdownTagIsIdentified(overId)).toThrow(
      /already reserved by/,
    );
  });

  test("a type whose own `attrs` emits a reserved annotated name throws at serialize", () => {
    // The half only a function body knows, so it cannot be caught at resolution
    // — and it fires whether or not a value was supplied for this node, since
    // the conflict is in the declaration, not in one document.
    const doubled = defineBlock({
      type: "doubled",
      schema: z.object({}),
      empty: () => ({}),
      markdown: {
        tag: {
          body: "children",
          annotated: ["status"],
          attrs: () => ({ status: "mine" }),
        },
      },
    }) as BlockHandle<unknown>;
    const ctx: MarkdownContext = {
      handles: [...handles, doubled],
      protectedSpans: [],
      blankLines: "empty-block",
    };
    expect(() => serializeForestToMarkdown([node("doubled", {})], ctx)).toThrow(
      /own `attrs` emitted one too/,
    );
  });

  test("a node carrying an UNDECLARED annotation throws rather than emitting it", () => {
    // Emitting it would make it a `data` key on the way back in (nothing
    // reserves it, so the strip never sees it); dropping it would make a fact
    // its supplier believes is in the document silently absent.
    expect(() =>
      serializeForestToMarkdown(
        [annotated("todo", {}, { priority: "high" })],
        mdCtx,
      ),
    ).toThrow(/does not declare in `markdown.tag.annotated`/);
  });

  test("a LINE-serialized type cannot carry an annotation either", () => {
    // Same refusal at the other branch: a paragraph has no attribute list, so
    // there is nowhere for the value to go and no tag that could declare it.
    expect(() =>
      serializeForestToMarkdown(
        [annotated("text", { text: runs("plain") }, { status: "done" })],
        mdCtx,
      ),
    ).toThrow(/serializes as markdown LINES/);
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
    // `quote` WRAPS the line on a typed `| ` (a container's typed prefix is a
    // wrap), and `| ` is exactly a table row's opening in markdown. Had it been a
    // `markdownPrefixes` entry, `derivedParsePrefixes` would claim both lines and
    // the pasted table would arrive as two quotes with the pipes eaten. Tables
    // have no block type yet, so the honest answer is prose — verbatim, so
    // nothing is lost.
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
    expect(conversionPrefixesOf(toDo as BlockHandle<unknown>)).toEqual([
      "[] ",
      "[ ] ",
    ]);
    // Ordering when a type declares BOTH: markdown syntax first, input-only after.
    const both = defineBlock({
      type: "both",
      schema: textDataSchema,
      empty: () => ({ text: [] }),
      markdownPrefixes: ["# "],
      typingPrefixes: ["! "],
    });
    expect(conversionPrefixesOf(both as BlockHandle<unknown>)).toEqual([
      "# ",
      "! ",
    ]);
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
      serializeForestToMarkdown(
        [identified("p1", "page", data, [child])],
        mdCtx,
      ),
    ).toBe(['<page id="p1">', "  inside", "</page>"].join("\n"));
    expect(
      serializeForestToMarkdown(
        [identified("p1", "page", data, [child], false)],
        mdCtx,
      ),
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
    expect(serialize(forest)).toBe(
      ["> folded", "  hidden but copied"].join("\n"),
    );
  });

  test("a sub-page needs its row id — an id-less forest fails LOUDLY", () => {
    expect(() =>
      serialize([node("page", { title: "Sub", icon: null })]),
    ).toThrow(/needs its row id/);
  });

  test("markdown parse alone can never mint a sub-page: `<page/>` is a page-link", () => {
    expect(parse('<page id="p1"/>')).toEqual([
      node("page-link", { pageId: "p1" }),
    ]);
  });

  test("a BODY on a parsed page tag is a loud rejection, never a silent drop", () => {
    expect(() =>
      parse(['<page id="p1">', "  smuggled", "</page>"].join("\n")),
    ).toThrow(/takes no body/);
    expect(() => parse('<page id="p1"></page>')).toThrow(/takes no body/);
  });

  test("a page tag with no id is a loud rejection", () => {
    expect(() => parse("<page/>")).toThrow(/needs an `id`/);
  });
});

describe("empty paragraphs", () => {
  const empty = (): SerializedBlock => node("text", { text: [] });

  test("an empty text block emits a blank line and comes back", () => {
    const forest = [
      node("text", { text: runs("a") }),
      empty(),
      node("text", { text: runs("b") }),
    ];
    expect(serialize(forest)).toBe("a\n\nb");
    expect(parse("a\n\nb")).toEqual(forest);
  });

  test("`<text/>` still parses, so documents written before this keep working", () => {
    // The tag is parse-only now — nothing emits it — but it is the one spelling
    // of an empty paragraph that survives a position a blank line cannot state.
    expect(parse("a\n<text/>\nb")).toEqual([
      node("text", { text: runs("a") }),
      empty(),
      node("text", { text: runs("b") }),
    ]);
  });

  test("a blank line lands at the depth of the block that FOLLOWS it — shallower", () => {
    // The empty paragraph is written as the last child of the bullet, and comes
    // back at root, beside it: a blank line carries no indent of its own, so the
    // block after it decides. This is the accepted loss, pinned so it stays a
    // known outcome (`research/2026-09-01-page-blank-line-empty-paragraph.md`).
    const forest = parse("- Bullet\n  - Nested\n\nNext");
    expect(forest.map((b) => b.type)).toEqual([
      "bulleted-list",
      "text",
      "text",
    ]);
    expect(forest.map(dataText)).toEqual(["Bullet", "", "Next"]);
    expect(forest[0]!.children.map(dataText)).toEqual(["Nested"]);
  });

  test("a blank line lands at the depth of the block that FOLLOWS it — deeper", () => {
    const forest = parse("- Bullet\n\n  - Nested");
    expect(forest).toHaveLength(1);
    expect(forest[0]!.children.map((b) => b.type)).toEqual([
      "text",
      "bulleted-list",
    ]);
    expect(forest[0]!.children.map(dataText)).toEqual(["", "Nested"]);
  });

  test("a leading and a trailing blank run are dropped", () => {
    // Nothing before them to be a sibling of, nothing after them to take a depth
    // from. On an apply that is an ordinary delete of a block owning nothing.
    expect(parse("\n\na\n\n\n")).toEqual([node("text", { text: runs("a") })]);
  });

  test("a blank run at the edge of a CONTAINER body is dropped too", () => {
    // A tag body recurses through the same parse, so "leading" and "trailing"
    // are per scope — the blank beside `a` inside the quote is an edge of that
    // body, not of the document.
    expect(parse("<quote>\n\n  a\n\n</quote>\nafter")).toEqual([
      {
        type: "quote",
        data: {},
        expanded: true,
        children: [node("text", { text: runs("a") })],
      },
      node("text", { text: runs("after") }),
    ]);
  });

  test("an empty paragraph between two container children survives", () => {
    const forest = [
      {
        type: "quote",
        data: {},
        expanded: true,
        children: [
          node("text", { text: runs("a") }),
          empty(),
          node("text", { text: runs("b") }),
        ],
      },
    ];
    expect(serialize(forest)).toBe("<quote>\n  a\n\n  b\n</quote>");
    expect(parse(serialize(forest))).toEqual(forest);
  });

  test("a nested empty paragraph emits an EMPTY line, never padded whitespace", () => {
    // Trailing whitespace is stripped in transit and reads as noise in a diff.
    const md = serialize([
      {
        ...node("text", { text: runs("parent") }),
        children: [
          node("text", { text: runs("a") }),
          empty(),
          node("text", { text: runs("b") }),
        ],
      },
    ]);
    expect(md).toBe("parent\n  a\n\n  b");
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
  const words = [
    "alpha",
    "bravo",
    "charlie",
    "delta*star",
    "echo_under",
    "foxtrot<lt",
  ];

  const gens: {
    type: string;
    data(r: () => number): unknown;
    children: boolean;
  }[] = [
    { type: "text", data: (r) => ({ text: pick(r) }), children: true },
    // An empty paragraph is a BLANK LINE, which carries no indent of its own —
    // so it cannot own children (they would re-parent onto the block above) and
    // its depth is read off the block that follows it. `representable` below
    // keeps the generated forest to the positions the dialect can state; the
    // ones it cannot are the accepted loss, each pinned by its own test in
    // `describe("empty paragraphs")`.
    { type: "text", data: () => ({ text: [] }), children: false },
    { type: "bulleted-list", data: (r) => ({ text: pick(r) }), children: true },
    { type: "heading-1", data: (r) => ({ text: pick(r) }), children: true },
    { type: "numbered-list", data: (r) => ({ text: pick(r) }), children: true },
    { type: "toggle", data: (r) => ({ text: pick(r) }), children: true },
    { type: "quote", data: () => ({}), children: true },
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
    {
      type: "equation",
      data: (r) => ({ expression: `x^${Math.floor(r() * 9)}` }),
      children: true,
    },
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
    { type: "private-notes", data: () => ({}), children: true },
    { type: "todo", data: () => ({}), children: true },
    // Id-less here, which is the point: the fuzz forest exercises the OMIT
    // branch of the identified tag — a card with no row id still serializes,
    // and comes back with no `ref` key at all.
    { type: "agent-notes", data: () => ({}), children: true },
    {
      type: "image",
      data: (r) => ({
        attachmentId: `att_${Math.floor(r() * 1000)}`,
        ...(r() < 0.5 ? { width: 320 + Math.floor(r() * 640) } : {}),
        ...(r() < 0.5 ? { alt: "a cat" } : {}),
      }),
      children: true,
    },
    {
      type: "video",
      data: (r) => ({ attachmentId: `v_${Math.floor(r() * 99)}` }),
      children: true,
    },
    {
      type: "audio",
      data: (r) => ({ attachmentId: `s_${Math.floor(r() * 99)}` }),
      children: true,
    },
    {
      type: "file",
      data: (r) => ({ filename: "notes.pdf", size: Math.floor(r() * 5000) }),
      children: true,
    },
    {
      type: "embed",
      data: () => ({ url: "https://example.com/e" }),
      children: true,
    },
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
    {
      type: "page-link",
      data: (r) => ({ pageId: `p${Math.floor(r() * 99)}` }),
      children: false,
    },
  ];

  function pick(r: () => number): RichText {
    const n = 1 + Math.floor(r() * 3);
    const parts: string[] = [];
    for (let i = 0; i < n; i++)
      parts.push(words[Math.floor(r() * words.length)]!);
    const marks =
      r() < 0.25
        ? ["bold" as const]
        : r() < 0.4
          ? ["italic" as const]
          : undefined;
    return [{ text: parts.join(" "), ...(marks ? { marks } : {}) }];
  }

  /** An empty text block — the one node whose markdown form is a blank line. */
  const isEmptyText = (b: SerializedBlock): boolean =>
    b.type === "text" && runsLength((b.data as { text: RichText }).text) === 0;

  /**
   * Drop the empty paragraphs a blank line cannot put back, so the property
   * below stays EXACT over everything else. Exactly two positions go, and they
   * are the two losses the design accepts:
   *
   *  - no sibling AFTER it: nothing follows to take a depth from, and at the end
   *    of a document or a container body the run is never flushed at all;
   *  - no sibling BEFORE it: a run at the start of a parse scope (the document,
   *    or one container's body) has nothing to be the previous sibling of.
   *
   * Everything between two siblings round-trips exactly, at any depth and inside
   * any container, which is what this narrowing leaves the property asserting.
   */
  const representable = (nodes: SerializedBlock[]): SerializedBlock[] => {
    // To a FIXED POINT: dropping a leading empty makes the next node leading.
    let kept = nodes;
    for (;;) {
      const next = kept.filter(
        (b, i) => !isEmptyText(b) || (i > 0 && i < kept.length - 1),
      );
      if (next.length === kept.length) break;
      kept = next;
    }
    return kept.map((b) => ({ ...b, children: representable(b.children) }));
  };

  const build = (r: () => number, depth: number): SerializedBlock => {
    const gen = gens[Math.floor(r() * gens.length)]!;
    const kids: SerializedBlock[] = [];
    if (gen.children && depth < 3) {
      const n = Math.floor(r() * (depth === 0 ? 3 : 2));
      for (let i = 0; i < n; i++) kids.push(build(r, depth + 1));
    }
    return {
      type: gen.type,
      data: gen.data(r),
      expanded: true,
      children: kids,
    };
  };

  test("parse(serialize(forest)) === forest, over 400 seeds", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const r = rng(seed);
      const generated: SerializedBlock[] = [];
      const roots = 1 + Math.floor(r() * 4);
      for (let i = 0; i < roots; i++) generated.push(build(r, 0));
      const forest = representable(generated);
      const md = serialize(forest);
      expect({ seed, forest: parse(md) }).toEqual({ seed, forest });
      // Idempotence: the emitted document is CANONICAL, so a second cycle is a
      // fixed point (the property the fence-indent bug broke).
      expect({ seed, md: serialize(parse(md)) }).toEqual({ seed, md });
    }
  });

  // -------------------------------------------------------------------------
  // The identified-tag property: every id survives, and ONLY as a `ref`
  // -------------------------------------------------------------------------
  //
  // The property above runs over an id-less forest, which proves the OMIT
  // branch. This one stamps a distinct id onto every node — the shape a real
  // read hands the serializer — and asserts the round trip is the identity map
  // plus exactly one thing: each identified node's `ref` is the id it was
  // serialized from. Everything else, identified nodes' own `data` and children
  // included, is byte-for-byte the same forest.
  //
  // The identified TYPE SET comes from the registry, never a literal — the same
  // derivation `markdown-apply` makes, so this property keeps holding when a new
  // type opts in.

  test("a stamped forest round-trips its ids as `ref` on identified nodes, over 200 seeds", () => {
    const identifiedTypes = new Set(
      handles.filter(markdownTagIsIdentified).map((h) => h.type),
    );
    // Non-vacuity: an empty set would make every assertion below trivially true.
    expect(identifiedTypes.size).toBeGreaterThan(0);

    /** Stamp a distinct id onto every node — path-derived, so it is readable. */
    const stamp = (nodes: SerializedBlock[], prefix: string): MarkdownNode[] =>
      nodes.map((n, i) => ({
        ...n,
        id: `block-${prefix}${i}`,
        children: stamp(n.children, `${prefix}${i}.`),
      }));

    /** The same forest, with a `ref` exactly where an identified tag carried one. */
    const expected = (nodes: MarkdownNode[]): SerializedBlock[] =>
      nodes.map((n) => ({
        type: n.type,
        data: n.data,
        expanded: true,
        children: expected(n.children),
        ...(identifiedTypes.has(n.type) ? { ref: n.id } : {}),
      }));

    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const generated: SerializedBlock[] = [];
      const roots = 1 + Math.floor(r() * 4);
      for (let i = 0; i < roots; i++) generated.push(build(r, 0));
      // Same narrowing as the property above, for the same reason: an empty
      // paragraph a blank line cannot place would not come back to be stamped.
      const stamped = stamp(representable(generated), "");
      const parsed = parseMarkdownToForest(
        serializeForestToMarkdown(stamped, mdCtx),
        mdCtx,
      );
      expect({ seed, forest: parsed }).toEqual({
        seed,
        forest: expected(stamped),
      });
    }
  });
});

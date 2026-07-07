/**
 * Round-trip property tests for the runs ↔ `Y.XmlText` bridge.
 * Run with `bun test plugins/page/plugins/editor/core/runs-yjs.test.ts`.
 *
 * Gate for the per-block CRDT plan's Stage 0
 * (`research/2026-07-07-page-per-block-crdt-plan-b.md`): `runs → xmlText → runs`
 * and `runs → xmlText → lexical → runs` must be identity on the normalized
 * (`coalesce`d) form for plain text, every mark and mark combination, colors,
 * links, soft breaks, and inline decorator tokens.
 *
 * Real decorator nodes (page-link / inline-date / inline-math) are gated in
 * their own plugins' `web/internal/collab-roundtrip.test.ts` — importing them
 * here would invert the plugin dependency graph. This file uses a synthetic
 * token decorator mirroring their exact shape.
 */

import { describe, expect, test } from "bun:test";
import {
  createEditor,
  DecoratorNode,
  type NodeKey,
  type SerializedLexicalNode,
} from "lexical";
import { LinkNode } from "@lexical/link";
import { Doc, applyUpdate, encodeStateAsUpdate } from "yjs";
import {
  editYDocState,
  readYDoc,
  yDocContent,
} from "@plugins/primitives/plugins/collab-doc/core";
import {
  COLOR_TOKENS,
  MARK_ORDER,
  coalesce,
  mergeRuns,
  type ColorToken,
  type Mark,
  type RichText,
} from "./rich-text";
import {
  $appendRuns,
  runsToLexical,
  serializeBlockRuns,
  type RunsTokenExtension,
} from "./runs-lexical";
import { runsToXmlText, xmlTextToRuns, type RunsXmlTextOptions } from "./runs-yjs";

// ---------------------------------------------------------------------------
// Synthetic inline token decorator (mirrors page-link/inline-date/inline-math)
// ---------------------------------------------------------------------------

class TokenNode extends DecoratorNode<null> {
  __tokenId: string;

  static getType(): string {
    return "test-token";
  }

  static clone(node: TokenNode): TokenNode {
    return new TokenNode(node.__tokenId, node.__key);
  }

  static importJSON(json: SerializedLexicalNode & { tokenId?: string }): TokenNode {
    return new TokenNode(json.tokenId ?? "");
  }

  constructor(tokenId = "", key?: NodeKey) {
    super(key);
    this.__tokenId = tokenId;
  }

  exportJSON(): SerializedLexicalNode & { tokenId: string } {
    return { type: "test-token", version: 1, tokenId: this.__tokenId };
  }

  isInline(): true {
    return true;
  }

  // Mirrors the real decorators: native text content stays empty; the token is
  // written by `serializeNode` only.
  getTextContent(): string {
    return "";
  }

  createDOM(): HTMLElement {
    throw new Error("createDOM must never be called headless");
  }

  updateDOM(): false {
    return false;
  }

  decorate(): null {
    return null;
  }

  getTokenId(): string {
    return this.__tokenId;
  }
}

const tokenExtension: RunsTokenExtension = {
  deserializePattern: /\[\[(tok-[a-z0-9]+)\]\]/,
  createNodeFromMatch: (m) => new TokenNode(m[1]!),
  serializeNode: (n) => (n instanceof TokenNode ? `[[${n.getTokenId()}]]` : null),
};

const tokenOpts: RunsXmlTextOptions = {
  extensions: [tokenExtension],
  nodes: [TokenNode],
};

/**
 * The pure `runs → Lexical → runs` normal form (no Yjs hop) — the existing
 * editor mapping's own normalization. Its one deviation from `coalesce(runs)`:
 * a soft `\n` inside a *marked* run becomes an unmarked LineBreak run (persisted
 * `data.text` always comes from `serializeBlockRuns`, so stored runs are always
 * already in this form).
 */
function lexicalNormalize(runs: RichText, opts: RunsXmlTextOptions = {}): RichText {
  const editor = createEditor({
    namespace: "normalize",
    nodes: [LinkNode, ...(opts.nodes ?? [])],
    onError: (error) => {
      throw error;
    },
  });
  editor.update(() => runsToLexical(runs, opts.extensions ?? []), { discrete: true });
  return serializeBlockRuns(editor, opts.extensions ?? []);
}

/**
 * `runs → xmlText → runs` must equal the pure Lexical round-trip — i.e. the
 * Yjs hop is exactly transparent. When `canonical` (the default), the input is
 * already in normal form, so the result must ALSO equal `coalesce(runs)` —
 * plain identity.
 */
function expectRoundTrip(
  runs: RichText,
  opts: RunsXmlTextOptions = {},
  { canonical = true }: { canonical?: boolean } = {},
): void {
  const xmlText = runsToXmlText(runs, opts);
  const result = xmlTextToRuns(xmlText, opts);
  expect(result).toEqual(lexicalNormalize(runs, opts));
  if (canonical) expect(result).toEqual(coalesce(runs));
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

describe("runs → xmlText → runs", () => {
  test("empty", () => {
    expectRoundTrip([]);
  });

  test("plain text", () => {
    expectRoundTrip([{ text: "hello world" }]);
  });

  test("each single mark", () => {
    for (const mark of MARK_ORDER) {
      expectRoundTrip([{ text: `with ${mark}`, marks: [mark] }]);
    }
  });

  test("every mark combination (all 32 subsets)", () => {
    for (let bits = 0; bits < 1 << MARK_ORDER.length; bits++) {
      const marks = MARK_ORDER.filter((_, i) => bits & (1 << i));
      const run = marks.length > 0 ? { text: "combo", marks: [...marks] } : { text: "combo" };
      expectRoundTrip([run]);
    }
  });

  test("every color token", () => {
    for (const color of COLOR_TOKENS) {
      const runs: RichText =
        color === "default" ? [{ text: "c" }] : [{ text: "c", color }];
      expectRoundTrip(runs);
    }
  });

  test("links, and link + marks + color together", () => {
    expectRoundTrip([{ text: "click", link: "https://example.com" }]);
    expectRoundTrip([
      { text: "fancy", marks: ["bold", "code"], color: "green", link: "https://x" },
    ]);
  });

  test("soft breaks inside and across runs", () => {
    expectRoundTrip([{ text: "a\nb" }]);
    expectRoundTrip([{ text: "line one\nline two\n" }]);
    // A `\n` inside a MARKED run is not canonical (the editor mapping splits it
    // into marked-text / unmarked-break / marked-text) — the Yjs hop must still
    // be transparent, and the split form must then be a plain fixed point.
    expectRoundTrip(
      [{ text: "bold\nstill", marks: ["bold"] }, { text: "\nplain" }],
      {},
      { canonical: false },
    );
    expectRoundTrip([
      { text: "bold", marks: ["bold"] },
      { text: "\n" },
      { text: "still", marks: ["bold"] },
    ]);
  });

  test("mixed adjacent runs stay distinct", () => {
    expectRoundTrip([
      { text: "a" },
      { text: "b", marks: ["bold"] },
      { text: "c", color: "blue" },
      { text: "d", link: "https://x" },
      { text: "e" },
    ]);
  });

  test("decorator token round-trips through a materialized node", () => {
    const runs: RichText = [{ text: "before [[tok-a1]] after" }];
    const xmlText = runsToXmlText(runs, tokenOpts);

    // The token must exist as a real decorator node in the doc — not as plain
    // text — otherwise this test would pass vacuously.
    const tokenIds = readYDoc(
      xmlText.doc!,
      (editor) =>
        editor.getEditorState().read(() => {
          const ids: string[] = [];
          const json = editor.getEditorState().toJSON();
          const walk = (n: Record<string, unknown>) => {
            if (n.type === "test-token") ids.push(n.tokenId as string);
            for (const c of (n.children as Record<string, unknown>[] | undefined) ?? []) walk(c);
          };
          walk(json.root as unknown as Record<string, unknown>);
          return ids;
        }),
      { nodes: [TokenNode] },
    );
    expect(tokenIds).toEqual(["tok-a1"]);

    expect(xmlTextToRuns(xmlText, tokenOpts)).toEqual(coalesce(runs));
  });

  test("marked text around a decorator token keeps its marks", () => {
    expectRoundTrip(
      [
        { text: "bold ", marks: ["bold"] },
        { text: "[[tok-b2]]" },
        { text: " tail", color: "red" },
      ],
      tokenOpts,
    );
  });

  test("without extensions, a token survives as plain run text", () => {
    // Lossless-by-construction: the token IS text when nothing materializes it.
    expectRoundTrip([{ text: "keep [[tok-c3]] literal" }]);
  });
});

// ---------------------------------------------------------------------------
// runs → xmlText → lexical → runs (explicit Lexical hop)
// ---------------------------------------------------------------------------

describe("runs → xmlText → lexical → runs", () => {
  test("hydrated Lexical state re-serializes to the same runs", () => {
    const runs: RichText = [
      { text: "plain " },
      { text: "bold", marks: ["bold"] },
      { text: "\n" },
      { text: "linked", link: "https://x", marks: ["italic"] },
      { text: " [[tok-d4]] " },
      { text: "colored", color: "purple" },
    ];
    const xmlText = runsToXmlText(runs, tokenOpts);
    const viaLexical = readYDoc(
      xmlText.doc!,
      (editor) => serializeBlockRuns(editor, tokenOpts.extensions),
      { nodes: [LinkNode, ...(tokenOpts.nodes ?? [])] },
    );
    expect(viaLexical).toEqual(coalesce(runs));
  });
});

// ---------------------------------------------------------------------------
// Generative cases (seeded — deterministic)
// ---------------------------------------------------------------------------

/** Tiny deterministic PRNG (mulberry32). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomRuns(rand: () => number): RichText {
  const pieces = ["a", "bc", "hello", " ", "x y", "\n", "z\nw", "[[tok-gen]]", "é✨"];
  const colors = COLOR_TOKENS.filter((c): c is Exclude<ColorToken, "default"> => c !== "default");
  const n = 1 + Math.floor(rand() * 6);
  const runs: RichText = [];
  for (let i = 0; i < n; i++) {
    const text = pieces[Math.floor(rand() * pieces.length)]!;
    const run: { text: string; marks?: Mark[]; color?: ColorToken; link?: string } = { text };
    const marks = MARK_ORDER.filter(() => rand() < 0.3);
    if (marks.length > 0) run.marks = [...marks];
    if (rand() < 0.25) run.color = colors[Math.floor(rand() * colors.length)]!;
    if (rand() < 0.2) run.link = "https://example.com/p";
    runs.push(run);
  }
  return runs;
}

describe("generative round-trips", () => {
  test("40 seeded random runs lists are identity after coalesce", () => {
    const rand = prng(20260707);
    for (let i = 0; i < 40; i++) {
      // Random runs may put `\n` inside marked runs — not canonical, so assert
      // Yjs-hop transparency against the pure Lexical normal form.
      expectRoundTrip(randomRuns(rand), tokenOpts, { canonical: false });
    }
  });
});

// ---------------------------------------------------------------------------
// Headless doc edit (the offscreen-merge fallback path, Stage 3a)
// ---------------------------------------------------------------------------

describe("editYDocState + $appendRuns (doc-level merge append)", () => {
  test("appending runs to an existing state merges to mergeRuns(a, b)", () => {
    const a: RichText = [
      { text: "head ", marks: ["bold"] },
      { text: "[[tok-m1]] mid" },
    ];
    const b: RichText = [
      { text: " tail", color: "blue" },
      { text: " plain\nnext" },
    ];
    const xmlText = runsToXmlText(a, tokenOpts);
    const state = encodeStateAsUpdate(xmlText.doc!);

    const incremental = editYDocState(
      state,
      () => $appendRuns(b, tokenOpts.extensions),
      { nodes: [LinkNode, ...(tokenOpts.nodes ?? [])] },
    );

    // Server doc-update semantics: merge the delta into the stored state.
    const merged = new Doc();
    applyUpdate(merged, state);
    applyUpdate(merged, incremental);
    expect(xmlTextToRuns(yDocContent(merged), tokenOpts)).toEqual(mergeRuns(a, b));
  });

  test("appending into an empty doc state equals the appended runs", () => {
    const b: RichText = [{ text: "only", marks: ["italic"] }];
    const xmlText = runsToXmlText([], tokenOpts);
    const state = encodeStateAsUpdate(xmlText.doc!);
    const incremental = editYDocState(
      state,
      () => $appendRuns(b, tokenOpts.extensions),
      { nodes: [LinkNode, ...(tokenOpts.nodes ?? [])] },
    );
    const merged = new Doc();
    applyUpdate(merged, state);
    applyUpdate(merged, incremental);
    expect(xmlTextToRuns(yDocContent(merged), tokenOpts)).toEqual(coalesce(b));
  });
});

// ---------------------------------------------------------------------------
// Deterministic seeds (Stage 4a): with a fixed `clientID`, identical runs must
// produce BYTE-IDENTICAL update encodings — the invariant that makes the
// provider's instant local pre-seed safe (independent seeders of the same
// block converge by no-op merge). Also: applying the same seed twice into one
// doc must be a no-op (no duplicated paragraphs/text).
// ---------------------------------------------------------------------------

describe("deterministic seeds (fixed clientID)", () => {
  const runs: RichText = [
    { text: "hello " },
    { text: "world", marks: ["bold"] },
  ];

  test("same runs + same clientID → byte-identical encodings", () => {
    const a = encodeStateAsUpdate(runsToXmlText(runs, { clientID: 42 }).doc!);
    const b = encodeStateAsUpdate(runsToXmlText(runs, { clientID: 42 }).doc!);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    // Sanity: without a fixed clientID the encodings differ (random ids).
    const c = encodeStateAsUpdate(runsToXmlText(runs).doc!);
    expect(Buffer.from(a).equals(Buffer.from(c))).toBe(false);
  });

  test("cross-merging two independently-built identical seeds is a no-op", () => {
    const a = encodeStateAsUpdate(runsToXmlText(runs, { clientID: 42 }).doc!);
    const b = encodeStateAsUpdate(runsToXmlText(runs, { clientID: 42 }).doc!);
    const merged = new Doc();
    applyUpdate(merged, a);
    applyUpdate(merged, b); // the "losing seeder applies the winner" path
    expect(xmlTextToRuns(yDocContent(merged))).toEqual(coalesce(runs));
  });
});

// ---------------------------------------------------------------------------
// Loud-failure contract
// ---------------------------------------------------------------------------

describe("xmlTextToRuns input validation", () => {
  test("rejects an XmlText that is not a doc's content root", async () => {
    const { XmlText } = await import("yjs");
    expect(() => xmlTextToRuns(new XmlText())).toThrow(/not attached/);
  });
});

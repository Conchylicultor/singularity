/**
 * Headless Lexical round-trip tests for the runs↔Lexical converter.
 * Run with `bun test plugins/page/plugins/editor/web/internal/block-text-extensions.test.ts`.
 *
 * Lexical can run without a DOM via `createEditor` + `editorState.read/update`.
 * We don't exercise decorator (page-link) round-trip here — that needs the
 * extension registry wired at app bootstrap — only marks/color/link, which is
 * the new surface this phase adds.
 */

import { test, expect, describe } from "bun:test";
import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isTextNode,
  $setSelection,
  createEditor,
  type CreateEditorArgs,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import { $isLinkNode, LinkNode } from "@lexical/link";
import type { XmlText } from "yjs";
import { readYDoc } from "@plugins/primitives/plugins/collab-doc/core";
import { defineInlineTokenNode } from "@plugins/primitives/plugins/text-editor/plugins/token-extension/plugins/node/core";
import type { RichText } from "../../core";
import { runsLength } from "../../core/rich-text";
import {
  TokenNode,
  paragraphsToXmlText,
  prng,
  randomParagraphs,
  randomRuns,
  tokenOpts,
} from "../../core/runs-corpus";
import {
  runsToXmlText,
  xmlTextContentLength,
  xmlTextToRuns,
} from "../../core/runs-yjs";
import {
  $linearCaretOffset,
  $paragraphsPlainLength,
  $placeCaretAtLinearOffset,
  $xmlBasisContentLength,
  nodePlainLength,
  blockTextTokenExtension,
  registerBlockTextExtension,
  runsToLexical,
  serializeBlockRuns,
} from "./block-text-extensions";

function roundTrip(runs: RichText): RichText {
  const editor = createEditor({
    namespace: "test",
    nodes: [LinkNode],
    onError: (e) => {
      throw e;
    },
  });
  editor.update(() => runsToLexical(runs), { discrete: true });
  return serializeBlockRuns(editor);
}

/** Build a headless editor with the runs tree applied. */
function makeEditor(
  runs: RichText,
  nodes: NonNullable<CreateEditorArgs["nodes"]> = [LinkNode],
): LexicalEditor {
  const editor = createEditor({
    namespace: "test",
    nodes,
    onError: (e) => {
      throw e;
    },
  });
  editor.update(() => runsToLexical(runs), { discrete: true });
  return editor;
}

/** Run `fn` inside a discrete update on `editor`. */
function update<T>(editor: LexicalEditor, fn: () => T): T {
  let out!: T;
  editor.update(
    () => {
      out = fn();
    },
    { discrete: true },
  );
  return out;
}

/** Run `fn` inside a read on `editor`. */
function read<T>(editor: LexicalEditor, fn: () => T): T {
  return editor.getEditorState().read(fn);
}

/** Find the first text node in the tree whose content equals `text`. */
function $findText(text: string): LexicalNode | null {
  let found: LexicalNode | null = null;
  const walk = (node: LexicalNode) => {
    if (found) return;
    if ($isTextNode(node) && node.getTextContent() === text) {
      found = node;
      return;
    }
    if ($isElementNode(node)) for (const c of node.getChildren()) walk(c);
  };
  for (const c of $getRoot().getChildren()) walk(c);
  return found;
}

/** Collapse the caret into a text node at `offset`. */
function $selectInText(node: LexicalNode, offset: number): void {
  const sel = $createRangeSelection();
  sel.anchor.set(node.getKey(), offset, "text");
  sel.focus.set(node.getKey(), offset, "text");
  $setSelection(sel);
}

/** Collapse the caret onto the ROOT at child index `index` (a paragraph boundary). */
function $selectRoot(index: number): void {
  const sel = $createRangeSelection();
  sel.anchor.set("root", index, "element");
  sel.focus.set("root", index, "element");
  $setSelection(sel);
}

describe("runs↔Lexical round-trip", () => {
  test("plain text", () => {
    expect(roundTrip([{ text: "hello world" }])).toEqual([
      { text: "hello world" },
    ]);
  });

  test("single mark", () => {
    expect(roundTrip([{ text: "bold", marks: ["bold"] }])).toEqual([
      { text: "bold", marks: ["bold"] },
    ]);
  });

  test("multiple marks canonicalized", () => {
    const out = roundTrip([{ text: "x", marks: ["italic", "bold"] }]);
    expect(out).toEqual([{ text: "x", marks: ["bold", "italic"] }]);
  });

  test("color", () => {
    expect(roundTrip([{ text: "red", color: "red" }])).toEqual([
      { text: "red", color: "red" },
    ]);
  });

  test("link wraps its text", () => {
    expect(roundTrip([{ text: "click", link: "https://x" }])).toEqual([
      { text: "click", link: "https://x" },
    ]);
  });

  test("color + link + marks coexist on one run", () => {
    const run = {
      text: "fancy",
      marks: ["bold" as const],
      color: "green" as const,
      link: "https://x",
    };
    expect(roundTrip([run])).toEqual([run]);
  });

  test("mixed adjacent runs survive and stay distinct", () => {
    const runs: RichText = [
      { text: "a" },
      { text: "b", marks: ["bold"] },
      { text: "c", color: "blue" },
    ];
    expect(roundTrip(runs)).toEqual(runs);
  });

  test("empty runs → empty (single empty paragraph serializes to [])", () => {
    expect(roundTrip([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Linear caret offset ↔ Lexical position
// ---------------------------------------------------------------------------

describe("$linearCaretOffset / $placeCaretAtLinearOffset", () => {
  test("multi-TextNode paragraph: offset spans both runs (not text-node-relative)", () => {
    // "Hello " (6) + bold "world" (5) → total 11.
    const runs: RichText = [
      { text: "Hello " },
      { text: "world", marks: ["bold"] },
    ];
    const editor = makeEditor(runs);

    expect(read(editor, () => $paragraphsPlainLength())).toBe(11);

    // Caret at the END of the bold node (in-node offset 5) → linear 11, not 5.
    update(editor, () => {
      const bold = $findText("world")!;
      $selectInText(bold, 5);
    });
    expect(read(editor, () => $linearCaretOffset())).toBe(11);

    // Placing at 11 lands at the end of the bold node; read===write round-trip.
    update(editor, () => $placeCaretAtLinearOffset(11));
    expect(read(editor, () => $linearCaretOffset())).toBe(11);

    // A caret inside the first run still reads its true linear offset.
    update(editor, () => {
      const hello = $findText("Hello ")!;
      $selectInText(hello, 3);
    });
    expect(read(editor, () => $linearCaretOffset())).toBe(3);
  });

  test("text/text boundary resolves to END of the earlier run (merge seam)", () => {
    const runs: RichText = [
      { text: "Hello " },
      { text: "world", marks: ["bold"] },
    ];
    const editor = makeEditor(runs);
    // Offset 6 sits exactly at the seam; `<=` rule lands at the end of "Hello "
    // (the earlier run), so a Backspace-merge caret sits on the seam.
    update(editor, () => $placeCaretAtLinearOffset(6));
    const onFirstRun = read(editor, () => {
      const hello = $findText("Hello ")!;
      // The resolved anchor should be the "Hello " text node at its end.
      return $linearCaretOffset() === 6 && hello.getTextContentSize() === 6;
    });
    expect(onFirstRun).toBe(true);
  });

  test("LinkNode-wrapped run: anchor inside the link resolves to a non-null offset", () => {
    // "x" (1) + link "link" (4) → total 5.
    const runs: RichText = [{ text: "x" }, { text: "link", link: "http://a" }];
    const editor = makeEditor(runs);

    expect(read(editor, () => $paragraphsPlainLength())).toBe(5);

    // Caret inside the link text (regression: old code returned null here because
    // the anchor's parent is the LinkNode, not a root child).
    update(editor, () => {
      const linkText = $findText("link")!;
      $selectInText(linkText, 2);
    });
    expect(read(editor, () => $linearCaretOffset())).toBe(3); // 1 ("x") + 2

    // Placing back at 3 lands inside the link, on the link text node.
    update(editor, () => $placeCaretAtLinearOffset(3));
    const insideLink = read(editor, () => {
      const text = $findText("link")!;
      return $isLinkNode(text.getParent());
    });
    expect(insideLink).toBe(true);
    expect(read(editor, () => $linearCaretOffset())).toBe(3);
  });

  test("LineBreakNode: offsets land on the correct side of the \\n", () => {
    // "a\nb" → one paragraph: text "a" (1) + LineBreak (1) + text "b" (1) = 3.
    const runs: RichText = [{ text: "a\nb" }];
    const editor = makeEditor(runs);

    expect(read(editor, () => $paragraphsPlainLength())).toBe(3);

    // Just before the break (offset 1): end of "a".
    update(editor, () => $placeCaretAtLinearOffset(1));
    expect(read(editor, () => $linearCaretOffset())).toBe(1);

    // Just after the break (offset 2): start of "b".
    update(editor, () => $placeCaretAtLinearOffset(2));
    expect(read(editor, () => $linearCaretOffset())).toBe(2);
  });

  test("boundaries: offset 0 (atStart) and offset total (atEnd) on a formatted run", () => {
    // A block ending in a bold run — the old $atEnd bug.
    const runs: RichText = [{ text: "hi " }, { text: "bold", marks: ["bold"] }];
    const editor = makeEditor(runs);
    const total = read(editor, () => $paragraphsPlainLength());
    expect(total).toBe(7);

    update(editor, () => $placeCaretAtLinearOffset(0));
    expect(read(editor, () => $linearCaretOffset())).toBe(0);

    // End of the bold run reports total (atEnd === true).
    update(editor, () => {
      const bold = $findText("bold")!;
      $selectInText(bold, 4);
    });
    expect(read(editor, () => $linearCaretOffset())).toBe(total);
  });

  test("empty paragraph: offset 0 collapses to start", () => {
    const editor = makeEditor([]);
    expect(read(editor, () => $paragraphsPlainLength())).toBe(0);
    update(editor, () => $placeCaretAtLinearOffset(0));
    expect(read(editor, () => $linearCaretOffset())).toBe(0);
  });

  test("out-of-range offset is clamped to total", () => {
    const runs: RichText = [{ text: "abc" }];
    const editor = makeEditor(runs);
    update(editor, () => $placeCaretAtLinearOffset(999));
    expect(read(editor, () => $linearCaretOffset())).toBe(3);
  });

  test("ROOT anchor resolves to a paragraph boundary, never null", () => {
    // Lexical mints a root-anchored element selection whenever the selection
    // first materializes while the root is childless — the normal state of a
    // freshly split/inserted block, whose caret then NEVER re-anchors on its own.
    // Returning null here read as `atStart: false` and silently demoted every
    // structural keystroke (Backspace/Delete/arrows) to a passthrough.
    const empty = makeEditor([]);
    update(empty, () => $selectRoot(0));
    expect(read(empty, () => $linearCaretOffset())).toBe(0);

    // Two paragraphs ("ab" ⏎ "cde") → linear "ab\ncde", total 6. Boundary before
    // paragraph 0 / 1, and past the last one (the end of the content).
    const editor = makeEditor([{ text: "ab" }]);
    update(editor, () => {
      const p = $createParagraphNode();
      p.append($createTextNode("cde"));
      $getRoot().append(p);
    });
    expect(read(editor, () => $paragraphsPlainLength())).toBe(6);

    update(editor, () => $selectRoot(0));
    expect(read(editor, () => $linearCaretOffset())).toBe(0);
    update(editor, () => $selectRoot(1));
    expect(read(editor, () => $linearCaretOffset())).toBe(3); // "ab" + join
    update(editor, () => $selectRoot(2));
    expect(read(editor, () => $linearCaretOffset())).toBe(6); // end, not 7
  });
});

// ---------------------------------------------------------------------------
// Token-aware decorator length
// ---------------------------------------------------------------------------

/**
 * A minimal inline decorator used to exercise token-aware length counting.
 * Declared through the shared primitive, so what this test asserts about a
 * decorator's length is asserted about the node synthesis that actually ships.
 */
const testTokenNode = defineInlineTokenNode<{ id: string }>({
  type: "test-token-length",
  fields: ["id"],
  token: ({ id }) => `[[${id}]]`,
  fieldsOf: (m) => ({ id: m[1]! }),
  // Native text content is empty (mirrors PageLinkInlineNode) — the token length
  // must come from the serializer, not getTextContent().
  textContent: "empty",
});
const TestTokenNode = testTokenNode.Node;

function tokenFor(id: string): string {
  return `[[${id}]]`;
}

describe("nodePlainLength", () => {
  test("text and line-break leaves count their plain length", () => {
    const editor = makeEditor([{ text: "a\nbc" }]);
    read(editor, () => {
      const a = $findText("a")!;
      const bc = $findText("bc")!;
      expect(nodePlainLength(a)).toBe(1);
      expect(nodePlainLength(bc)).toBe(2);
      // The LineBreakNode sits between them.
      const para = $getRoot().getChildren()[0]!;
      const lineBreak = $isElementNode(para)
        ? para.getChildren().find((n) => !$isTextNode(n) && !$isElementNode(n))
        : undefined;
      expect(lineBreak).toBeTruthy();
      expect(nodePlainLength(lineBreak!)).toBe(1);
    });
  });

  test("decorator node counts its serialized token length, not getTextContent()", () => {
    // Register a token extension so `tokenOf` (and thus nodePlainLength) sees it.
    const unregister = registerBlockTextExtension(
      blockTextTokenExtension({
        id: "test-token-length",
        node: testTokenNode,
        pattern: /\[\[([a-z0-9]+)\]\]/,
        // Both of these are irrelevant to THIS suite, which asserts LENGTH, and
        // both are required on purpose: a token family that cannot paint itself
        // outside Lexical is a tsc error, and so is one that leaves "do my bytes
        // need masking from the markdown inline scan?" unanswered.
        markdownSpan: "transparent",
        renderToken: ({ id }) => id,
      }),
    );
    try {
      const editor = createEditor({
        namespace: "test",
        nodes: [LinkNode, TestTokenNode],
        onError: (e) => {
          throw e;
        },
      });
      // Build: text "x" + decorator token "[[p1]]" (6 chars) + text "y".
      update(editor, () => {
        const root = $getRoot();
        root.clear();
        const para = $createParagraphNode();
        para.append($createTextNode("x"));
        para.append(testTokenNode.create({ id: "p1" }));
        para.append($createTextNode("y"));
        root.append(para);
      });

      const token = tokenFor("p1"); // "[[p1]]" → length 6
      read(editor, () => {
        let decorator: LexicalNode | undefined;
        const para = $getRoot().getChildren()[0]!;
        if ($isElementNode(para)) {
          decorator = para
            .getChildren()
            .find((n) => n instanceof TestTokenNode);
        }
        expect(decorator).toBeTruthy();
        expect(nodePlainLength(decorator!)).toBe(token.length);
        // The whole paragraph: 1 ("x") + token.length + 1 ("y").
        expect($paragraphsPlainLength()).toBe(1 + token.length + 1);
      });

      // Offsets past the token stay aligned: placing after the token (offset
      // 1 + token.length) and reading back gives the same linear offset.
      update(editor, () => $placeCaretAtLinearOffset(1 + token.length));
      expect(read(editor, () => $linearCaretOffset())).toBe(1 + token.length);

      // serializeBlockRuns emits the token in the run text — its length matches.
      const runs = serializeBlockRuns(editor);
      const joined = runs.map((r) => r.text).join("");
      expect(joined).toBe(`x${token}y`);
    } finally {
      unregister();
    }
  });
});

// ---------------------------------------------------------------------------
// The Yjs basis: `$xmlBasisContentLength` ⟷ `xmlTextContentLength`
// ---------------------------------------------------------------------------
//
// The property that makes a hydration check statable at all: what the editor
// RENDERS and what the content doc HOLDS must be counted in the same basis. One
// walks the Lexical tree, the other the `Y.XmlText`; they must agree on every
// input, or a perfectly-hydrated block reads as starved.
//
// Corpus (generators + the synthetic inline decorator) is shared with
// `core/runs-yjs.test.ts` via `core/runs-corpus.ts`, so both properties fuzz the
// same inputs.

/** Hydrate a headless editor from the doc and read its rendered length. */
function editorBasisLength(xmlText: XmlText): number {
  return readYDoc(
    xmlText.doc!,
    (editor) => editor.getEditorState().read(() => $xmlBasisContentLength()),
    { nodes: [LinkNode, TokenNode] },
  );
}

/** What the OTHER (stored-runs) basis would say — the arithmetic to avoid. */
function runsBasisLength(xmlText: XmlText): number {
  return runsLength(xmlTextToRuns(xmlText, tokenOpts));
}

describe("$xmlBasisContentLength", () => {
  // The expected numbers below are the Yjs REPRESENTATION, spelled out so a
  // change in `@lexical/yjs`'s shape breaks here with an explanation rather than
  // only as an opaque property failure. Every text node costs its chars + 1 (its
  // property `Y.Map`); a line break and a decorator cost 1; elements cost 0.
  test("fixtures: text, break, decorator, link, paragraph join", () => {
    // One text node: 5 chars + its property map.
    const hello = runsToXmlText([{ text: "hello" }], tokenOpts);
    expect(editorBasisLength(hello)).toBe(6);
    expect(xmlTextContentLength(hello)).toBe(6);
    expect(runsBasisLength(hello)).toBe(5);

    // "a" + break + "b" → (1+1) + 1 + (1+1).
    const soft = runsToXmlText([{ text: "a\nb" }], tokenOpts);
    expect(editorBasisLength(soft)).toBe(5);
    expect(xmlTextContentLength(soft)).toBe(5);

    // Inline decorator → 1, NOT its 11-char token: (1+1) + 1 + (1+1) = 5, while
    // the runs basis spells the token out and says 12.
    const chip = runsToXmlText([{ text: "x[[tok-a1]]y" }], tokenOpts);
    expect(editorBasisLength(chip)).toBe(5);
    expect(xmlTextContentLength(chip)).toBe(5);
    expect(runsBasisLength(chip)).toBe(12);

    // LinkNode recurses, contributing nothing for itself: (1+2) + (1+2).
    const link = runsToXmlText(
      [{ text: "ab" }, { text: "cd", link: "https://x" }],
      tokenOpts,
    );
    expect(editorBasisLength(link)).toBe(6);
    expect(xmlTextContentLength(link)).toBe(6);

    // Paragraph join: 0 in the Yjs basis, +1 per join in the runs basis.
    const twoParas = paragraphsToXmlText(
      [[{ text: "ab" }], [{ text: "cde" }]],
      tokenOpts,
    );
    expect(editorBasisLength(twoParas)).toBe(7);
    expect(xmlTextContentLength(twoParas)).toBe(7);
    expect(runsBasisLength(twoParas)).toBe(6);
  });

  test("seeded corpus: the two walks agree on every generated block", () => {
    const rand = prng(20260803);
    // Non-vacuity counters: the corpus must actually contain the two shapes
    // where the naive (stored-runs) comparison is false, or this property would
    // pass without ever exercising the thing it exists to pin.
    let cases = 0;
    let divergentFromRunsBasis = 0;
    let multiParagraph = 0;

    for (let i = 0; i < 120; i++) {
      // Single-paragraph blocks, straight from runs (the shape the editor mints).
      const runs = randomRuns(rand);
      const single = runsToXmlText(runs, tokenOpts);
      expect(editorBasisLength(single)).toBe(xmlTextContentLength(single));
      cases++;
      if (runsBasisLength(single) !== xmlTextContentLength(single))
        divergentFromRunsBasis++;

      // Multi-paragraph blocks — the join divergence `runsToLexical` cannot make.
      const paras = randomParagraphs(rand);
      const many = paragraphsToXmlText(paras, tokenOpts);
      expect(editorBasisLength(many)).toBe(xmlTextContentLength(many));
      cases++;
      if (paras.length > 1) multiParagraph++;
      if (runsBasisLength(many) !== xmlTextContentLength(many))
        divergentFromRunsBasis++;
    }

    expect(cases).toBe(240);
    expect(multiParagraph).toBeGreaterThan(0);
    // The whole point: on a large fraction of the corpus the OTHER basis
    // disagrees, so the equality above is a real constraint and not a tautology.
    expect(divergentFromRunsBasis).toBeGreaterThan(20);
  });
});

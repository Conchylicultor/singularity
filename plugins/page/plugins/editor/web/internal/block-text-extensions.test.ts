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
  DecoratorNode,
  type CreateEditorArgs,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
} from "lexical";
import { $isLinkNode, LinkNode } from "@lexical/link";
import type { RichText } from "../../core";
import {
  $linearCaretOffset,
  $paragraphsPlainLength,
  $placeCaretAtLinearOffset,
  nodePlainLength,
  registerBlockTextExtension,
  runsToLexical,
  serializeBlockRuns,
} from "./block-text-extensions";

function roundTrip(runs: RichText): RichText {
  const editor = createEditor({ namespace: "test", nodes: [LinkNode], onError: (e) => { throw e; } });
  editor.update(() => runsToLexical(runs), { discrete: true });
  return serializeBlockRuns(editor);
}

/** Build a headless editor with the runs tree applied. */
function makeEditor(
  runs: RichText,
  nodes: NonNullable<CreateEditorArgs["nodes"]> = [LinkNode],
): LexicalEditor {
  const editor = createEditor({ namespace: "test", nodes, onError: (e) => { throw e; } });
  editor.update(() => runsToLexical(runs), { discrete: true });
  return editor;
}

/** Run `fn` inside a discrete update on `editor`. */
function update<T>(editor: LexicalEditor, fn: () => T): T {
  let out!: T;
  editor.update(() => { out = fn(); }, { discrete: true });
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

describe("runs↔Lexical round-trip", () => {
  test("plain text", () => {
    expect(roundTrip([{ text: "hello world" }])).toEqual([{ text: "hello world" }]);
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
    const runs: RichText = [{ text: "Hello " }, { text: "world", marks: ["bold"] }];
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
    const runs: RichText = [{ text: "Hello " }, { text: "world", marks: ["bold"] }];
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
});

// ---------------------------------------------------------------------------
// Token-aware decorator length
// ---------------------------------------------------------------------------

/** A minimal inline decorator used to exercise token-aware length counting. */
class TestTokenNode extends DecoratorNode<null> {
  __id: string;
  static getType(): string {
    return "test-token";
  }
  static clone(node: TestTokenNode): TestTokenNode {
    return new TestTokenNode(node.__id, node.__key);
  }
  static importJSON(json: SerializedLexicalNode & { id?: string }): TestTokenNode {
    return new TestTokenNode(json.id ?? "");
  }
  constructor(id = "", key?: NodeKey) {
    super(key);
    this.__id = id;
  }
  exportJSON(): SerializedLexicalNode & { id: string } {
    return { type: "test-token", version: 1, id: this.__id };
  }
  isInline(): true {
    return true;
  }
  // Native text content is empty (mirrors PageLinkInlineNode) — the token length
  // must come from the serializer, not getTextContent().
  getTextContent(): string {
    return "";
  }
  createDOM(): HTMLElement {
    return globalThis.document?.createElement("span") ?? ({} as HTMLElement);
  }
  updateDOM(): false {
    return false;
  }
  decorate(): null {
    return null;
  }
  getId(): string {
    return this.__id;
  }
}

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
    const unregister = registerBlockTextExtension({
      id: "test-token",
      node: TestTokenNode,
      serializeNode: (n) => (n instanceof TestTokenNode ? tokenFor(n.getId()) : null),
    });
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
        para.append(new TestTokenNode("p1"));
        para.append($createTextNode("y"));
        root.append(para);
      });

      const token = tokenFor("p1"); // "[[p1]]" → length 6
      read(editor, () => {
        let decorator: LexicalNode | undefined;
        const para = $getRoot().getChildren()[0]!;
        if ($isElementNode(para)) {
          decorator = para.getChildren().find((n) => n instanceof TestTokenNode);
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

/**
 * Headless Lexical ↔ Yjs bridge round-trip tests.
 * Run with `bun test plugins/primitives/plugins/collab-doc/core/internal/headless-collab.test.ts`.
 *
 * Verifies the domain-agnostic seam: an editor state pushed into a `Y.Doc` via
 * `yDocFromLexical` hydrates back to an identical editor state via `readYDoc`,
 * including formatted text, line breaks, element nesting (LinkNode), and a
 * custom inline DecoratorNode whose fields must survive the property sync.
 */

import { describe, expect, test } from "bun:test";
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  createEditor,
  DecoratorNode,
  type NodeKey,
  type SerializedEditorState,
  type SerializedLexicalNode,
} from "lexical";
import { $createLinkNode, LinkNode } from "@lexical/link";
import {
  readYDoc,
  yDocContent,
  yDocFromLexical,
  type HeadlessCollabOptions,
} from "./headless-collab";

type Nodes = HeadlessCollabOptions["nodes"];

/** Minimal inline decorator with a synced field, zero-arg constructible. */
class ChipNode extends DecoratorNode<null> {
  __chipId: string;

  static getType(): string {
    return "test-chip";
  }

  static clone(node: ChipNode): ChipNode {
    return new ChipNode(node.__chipId, node.__key);
  }

  static importJSON(json: SerializedLexicalNode & { chipId?: string }): ChipNode {
    return new ChipNode(json.chipId ?? "");
  }

  constructor(chipId = "", key?: NodeKey) {
    super(key);
    this.__chipId = chipId;
  }

  exportJSON(): SerializedLexicalNode & { chipId: string } {
    return { type: "test-chip", version: 1, chipId: this.__chipId };
  }

  isInline(): true {
    return true;
  }

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

  getChipId(): string {
    return this.__chipId;
  }
}

/** The editor-state JSON `populate` produces directly, without any Yjs hop. */
function directJson(populate: () => void, nodes: Nodes = []): SerializedEditorState {
  const editor = createEditor({
    namespace: "direct",
    nodes,
    onError: (error) => {
      throw error;
    },
  });
  editor.update(populate, { discrete: true });
  return editor.getEditorState().toJSON();
}

/** The editor-state JSON after a full Lexical → Y.Doc → Lexical round-trip. */
function roundTripJson(populate: () => void, nodes: Nodes = []): SerializedEditorState {
  const doc = yDocFromLexical(populate, { nodes });
  return readYDoc(doc, (editor) => editor.getEditorState().toJSON(), { nodes });
}

describe("yDocFromLexical / readYDoc", () => {
  test("plain paragraph round-trips to an identical editor state", () => {
    const populate = () => {
      const para = $createParagraphNode();
      para.append($createTextNode("hello world"));
      $getRoot().append(para);
    };
    expect(roundTripJson(populate)).toEqual(directJson(populate));
  });

  test("formatted text, line breaks, and links survive", () => {
    const populate = () => {
      const para = $createParagraphNode();
      const bold = $createTextNode("bold");
      bold.toggleFormat("bold");
      bold.toggleFormat("italic");
      bold.setStyle("color: var(--x)");
      para.append($createTextNode("a"), bold, $createLineBreakNode());
      const link = $createLinkNode("https://example.com");
      link.append($createTextNode("click"));
      para.append(link);
      $getRoot().append(para);
    };
    expect(roundTripJson(populate, [LinkNode])).toEqual(
      directJson(populate, [LinkNode]),
    );
  });

  test("custom inline decorator fields survive the property sync", () => {
    const populate = () => {
      const para = $createParagraphNode();
      para.append($createTextNode("x"), new ChipNode("chip-42"), $createTextNode("y"));
      $getRoot().append(para);
    };
    expect(roundTripJson(populate, [ChipNode])).toEqual(
      directJson(populate, [ChipNode]),
    );

    // Also assert the decorator materializes as a real node instance (not text).
    const doc = yDocFromLexical(populate, { nodes: [ChipNode] });
    const chipIds = readYDoc(
      doc,
      (editor) =>
        editor.getEditorState().read(() => {
          const para = $getRoot().getChildren()[0]!;
          if (!$isElementNode(para)) throw new Error("expected element root child");
          return para
            .getChildren()
            .filter((n): n is ChipNode => n instanceof ChipNode)
            .map((n) => n.getChipId());
        }),
      { nodes: [ChipNode] },
    );
    expect(chipIds).toEqual(["chip-42"]);
  });

  test("empty editor round-trips to an empty root", () => {
    const populate = () => {
      $getRoot().append($createParagraphNode());
    };
    expect(roundTripJson(populate)).toEqual(directJson(populate));
  });

  test("yDocContent returns the binding's content root", () => {
    const doc = yDocFromLexical(() => {
      const para = $createParagraphNode();
      para.append($createTextNode("z"));
      $getRoot().append(para);
    });
    const xmlText = yDocContent(doc);
    expect(xmlText.doc).toBe(doc);
    // The root XmlText embeds one paragraph-level shared type.
    expect(xmlText.toDelta()).toHaveLength(1);
  });

  test("readYDoc never mutates the source doc", () => {
    const doc = yDocFromLexical(() => {
      const para = $createParagraphNode();
      para.append($createTextNode("stable"));
      $getRoot().append(para);
    });
    const stateBefore = JSON.stringify(yDocContent(doc).toDelta());
    readYDoc(doc, (editor) => editor.getEditorState().toJSON());
    expect(JSON.stringify(yDocContent(doc).toDelta())).toBe(stateBefore);
  });
});

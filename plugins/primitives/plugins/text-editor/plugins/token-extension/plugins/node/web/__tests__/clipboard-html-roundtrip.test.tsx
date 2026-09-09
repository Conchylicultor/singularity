/**
 * A chip copied out of one Lexical editor and pasted into ANOTHER survives the
 * crossing.
 *
 * The two editors are the whole point. Lexical accepts its own
 * `application/x-lexical-editor` payload only when the namespaces match
 * (`@lexical/clipboard`'s `$insertDataTransferForRichText`), and every page block
 * is its own editor with its own namespace (`block-text-<blockId>`) — so a copy
 * from one block to the next never gets that payload back and lands on the
 * `text/html` arm exercised here. When that arm was a decorator's empty
 * `createDOM()` host, the paste was a blank.
 *
 * jsdom, because both halves are DOM: `exportDOM` builds an element and
 * `importDOM` reads one back.
 */

import { describe, expect, it } from "vitest";
import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import {
  $createParagraphNode,
  $getRoot,
  $isDecoratorNode,
  $isElementNode,
  createEditor,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import { defineInlineTokenNode } from "../../core";

type MentionFields = { pageId: string; reminderId: string | null };

/**
 * Two fields carrying the two things a lossy encoding drops: a camelCase name
 * (an attribute-per-field would lowercase it) and a genuine `null` (which must
 * not come back as `""`).
 */
const mention = defineInlineTokenNode<MentionFields>({
  type: "roundtrip-mention",
  fields: ["pageId", "reminderId"],
  token: ({ pageId, reminderId }) =>
    reminderId === null ? `[[page:${pageId}]]` : `[[r:${reminderId}]]`,
  fieldsOf: (m) => ({ pageId: m[1]!, reminderId: null }),
  textContent: "empty",
});

const decorated = mention.decorated({ render: () => null });

function editorWith(namespace: string, ...nodes: unknown[]): LexicalEditor {
  return createEditor({
    namespace,
    nodes: nodes as never,
    onError: (e) => {
      throw e;
    },
  });
}

/**
 * Run `fn` inside a discrete update and hand back what it returned.
 *
 * Only PLAIN data may cross this boundary: a `LexicalNode` read after the
 * update has committed resolves against a node map it is no longer in.
 */
function inEditor<T>(editor: LexicalEditor, fn: () => T): T {
  let out!: T;
  editor.update(
    () => {
      out = fn();
    },
    { discrete: true },
  );
  return out;
}

/** The `text/html` flavour of a document holding exactly one chip. */
function copyHtml(editor: LexicalEditor, fields: MentionFields): string {
  return inEditor(editor, () => {
    const paragraph = $createParagraphNode();
    paragraph.append(decorated.create(fields));
    $getRoot().clear().append(paragraph);
    return $generateHtmlFromNodes(editor);
  });
}

/** Every node in the forest, parents before children. */
function flatten(nodes: readonly LexicalNode[]): LexicalNode[] {
  return nodes.flatMap((node) => [
    node,
    ...($isElementNode(node) ? flatten(node.getChildren()) : []),
  ]);
}

/** What pasting `html` into `editor` produces, read while the nodes are live. */
function pasteHtml(
  editor: LexicalEditor,
  html: string,
): { tokens: MentionFields[]; decorators: number; text: string } {
  return inEditor(editor, () => {
    const dom = new DOMParser().parseFromString(html, "text/html");
    const roots = $generateNodesFromDOM(editor, dom);
    const all = flatten(roots);
    const tokens = all.filter((n) => decorated.is(n));
    return {
      tokens: tokens.map((n) => decorated.fieldsOfNode(n)),
      decorators: tokens.filter((n) => $isDecoratorNode(n)).length,
      text: roots.map((n) => n.getTextContent()).join(""),
    };
  });
}

const ONE_CHIP: MentionFields = { pageId: "block-1", reminderId: null };

describe("a token crossing between two editors", () => {
  it("arrives as its node, with every field intact", () => {
    const source = editorWith("block-text-aaa", decorated.Node);
    const target = editorWith("block-text-bbb", decorated.Node);

    const pasted = pasteHtml(target, copyHtml(source, ONE_CHIP));

    expect(pasted.tokens).toEqual([ONE_CHIP]);
    expect(pasted.decorators).toBe(1);
  });

  it("does not paste a blank — the regression", () => {
    // The bug was markup that is non-empty (so Lexical's paste takes the HTML
    // arm) and carries nothing (so the paste lands blank).
    const source = editorWith("block-text-aaa", decorated.Node);
    expect(copyHtml(source, ONE_CHIP)).toContain("[[page:block-1]]");
  });

  it("falls back to the token's characters when the family is unregistered", () => {
    // A composition without this plugin — or another app entirely. Nothing can
    // rebuild the node, and the characters the token is made of are what is
    // left; before, there was nothing at all.
    const source = editorWith("block-text-aaa", decorated.Node);
    const target = editorWith("block-text-bbb");

    const pasted = pasteHtml(target, copyHtml(source, ONE_CHIP));

    expect(pasted.tokens).toEqual([]);
    expect(pasted.text).toContain("[[page:block-1]]");
  });

  it("keeps a null field null rather than collapsing it to an empty string", () => {
    const withId = pasteHtml(
      editorWith("block-text-bbb", decorated.Node),
      copyHtml(editorWith("block-text-aaa", decorated.Node), {
        pageId: "p",
        reminderId: "rem-1",
      }),
    );
    expect(withId.tokens[0]?.reminderId).toBe("rem-1");

    const withoutId = pasteHtml(
      editorWith("block-text-ddd", decorated.Node),
      copyHtml(editorWith("block-text-ccc", decorated.Node), {
        pageId: "p",
        reminderId: null,
      }),
    );
    expect(withoutId.tokens[0]?.reminderId).toBeNull();
  });
});

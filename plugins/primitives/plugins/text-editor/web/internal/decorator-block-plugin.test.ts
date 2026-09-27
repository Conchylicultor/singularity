import { describe, it, expect } from "bun:test";
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  createEditor,
  LineBreakNode,
} from "lexical";
import { defineInlineTokenNode } from "@plugins/primitives/plugins/text-editor/plugins/token-extension/plugins/node/core";
import { hoistDecoratorAfterLineBreakToNewBlock } from "./decorator-block-plugin";

const chip = defineInlineTokenNode<{ raw: string }>({
  type: "decorator-block-test-chip",
  fields: ["raw"],
  token: ({ raw }) => raw,
  fieldsOf: (m) => ({ raw: m[0] }),
  textContent: "token",
});

/** `line1` + line break (+ `tail`), caret at `caretAt` of the paragraph. */
function editorWithLines(tail: string | null) {
  const editor = createEditor({
    nodes: [chip.Node],
    onError: (err) => {
      throw err;
    },
  });
  editor.registerNodeTransform(
    LineBreakNode,
    hoistDecoratorAfterLineBreakToNewBlock,
  );
  editor.update(
    () => {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode("line1"), $createLineBreakNode());
      if (tail !== null) {
        paragraph.append($createLineBreakNode(), $createTextNode(tail));
      }
      $getRoot().append(paragraph);
      // The caret on the empty line right after the first break — where a
      // user who pressed Shift+Enter and then pasted stands.
      paragraph.select(2, 2);
    },
    { discrete: true },
  );
  return editor;
}

function insertChipAtCaret(editor: ReturnType<typeof editorWithLines>) {
  editor.update(() => $insertNodes([chip.create({ raw: "IMG" })]), {
    discrete: true,
  });
}

/** Where the caret stands, as [paragraph index, text before it on its line]. */
function caret(editor: ReturnType<typeof editorWithLines>) {
  return editor.getEditorState().read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) throw new Error("no range selection");
    expect(selection.isCollapsed()).toBe(true);
    const point = selection.anchor;
    const node = point.getNode();
    const paragraph = node.getTopLevelElementOrThrow();
    const before =
      point.type === "text"
        ? node
            .getPreviousSiblings()
            .map((n) => n.getTextContent())
            .join("") + node.getTextContent().slice(0, point.offset)
        : paragraph
            .getChildren()
            .slice(0, point.offset)
            .map((n) => n.getTextContent())
            .join("");
    return [paragraph.getIndexWithinParent(), before];
  });
}

describe("hoistDecoratorAfterLineBreakToNewBlock", () => {
  it("keeps the caret after a chip pasted on a fresh last line", () => {
    const editor = editorWithLines(null);
    insertChipAtCaret(editor);
    // The chip moved into its own paragraph, and the caret with it — not back
    // to the end of `line1`, where the next keystroke would land.
    expect(caret(editor)).toEqual([1, "IMG"]);
  });

  it("keeps the caret after a chip pasted on a fresh line above more text", () => {
    const editor = editorWithLines("line3");
    insertChipAtCaret(editor);
    expect(caret(editor)).toEqual([1, "IMG"]);
    expect(
      editor.getEditorState().read(() => $getRoot().getTextContent()),
    ).toBe("line1\n\nIMG\nline3");
  });
});

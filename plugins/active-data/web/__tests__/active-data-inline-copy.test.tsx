import { describe, it, expect } from "vitest";
import { createEditor, $getRoot, $createParagraphNode } from "lexical";
import {
  ActiveDataInlineNode,
  $createActiveDataInlineNode,
} from "../internal/active-data-inline-node";

// Lexical builds the `text/plain` clipboard payload from the selection's text
// content, which concatenates each node's getTextContent(). A bare DecoratorNode
// contributes "" by default, so a copied inline chip (e.g. a `<ui-context…>`
// element token) would be lost. The generic node overrides getTextContent() to
// emit the raw token; this pins that the copy path carries it verbatim so it can
// re-deserialize into a chip when pasted elsewhere.
describe("active-data inline node copy", () => {
  const token =
    '<ui-context url="http://x.localhost:9000/agents" plugin="tasks/task-header"><hint>h</hint><picked-content>button — Launch agent</picked-content></ui-context>';

  it("emits the raw token as text content (basis of clipboard text/plain)", () => {
    const editor = createEditor({
      nodes: [ActiveDataInlineNode],
      onError: (e) => {
        throw e;
      },
    });
    let text = "";
    editor.update(
      () => {
        const p = $createParagraphNode();
        p.append($createActiveDataInlineNode(token));
        $getRoot().clear().append(p);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      text = $getRoot().getTextContent();
    });
    expect(text).toBe(token);
  });
});

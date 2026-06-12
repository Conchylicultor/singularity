import { describe, it, expect } from "vitest";
import { createEditor, $getRoot, $createParagraphNode } from "lexical";
import { serializeUiContext, type UiContextMeta } from "../../core";
import { UiContextNode, $createUiContextNode } from "../internal/ui-context-node";

// Lexical builds the `text/plain` clipboard payload from the selection's text
// content, which concatenates each node's getTextContent(). A DecoratorNode
// contributes "" by default, so a copied ui-context chip would be lost. The
// node overrides getTextContent() to emit the full <ui-context…/> tag; this
// test pins that the copy path (text extraction) carries the tag so it can be
// re-deserialized into a chip when pasted into the task-draft prompt.
describe("ui-context chip copy", () => {
  const meta: UiContextMeta = {
    url: "http://x.localhost:9000/agents",
    pluginId: "tasks/task-header",
    slotId: "TaskDetail.Section",
    element: "button — Launch agent",
  };

  it("emits the serialized tag as text content (basis of clipboard text/plain)", () => {
    const editor = createEditor({ nodes: [UiContextNode], onError: (e) => { throw e; } });
    let text = "";
    editor.update(
      () => {
        const p = $createParagraphNode();
        p.append($createUiContextNode(meta));
        $getRoot().clear().append(p);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      text = $getRoot().getTextContent();
    });
    expect(text).toBe(serializeUiContext(meta));
    expect(text).toContain("<ui-context");
    expect(text).toContain("button — Launch agent");
  });
});

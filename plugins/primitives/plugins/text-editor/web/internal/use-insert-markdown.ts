import { useCallback } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { getNodeExtensions } from "./node-extensions";
import { $insertMarkdownSnippet } from "./markdown";

/**
 * THE way to drop a raw markdown snippet into the editor at the caret.
 *
 * Every entry point routes through here so a snippet behaves identically
 * wherever it comes from: newlines become real line breaks (not literal "\n"
 * inside a text node, whose caret rect the browser cannot place — which is what
 * makes the viewport jump), extension tokens deserialize into their nodes, and
 * with no live caret the snippet appends at the end instead of at the top.
 *
 * Must be called inside a `LexicalComposer` (the editor's own subtree).
 */
export function useInsertMarkdown(): (text: string) => void {
  const [editor] = useLexicalComposerContext();
  return useCallback(
    (text: string) => {
      editor.update(
        () => {
          // Read at insert time, not at render: the registry folds in lazy
          // sources, so the set an early render would have captured can still
          // be missing families that registered since.
          $insertMarkdownSnippet(text, getNodeExtensions());
        },
        // The caret belongs in the editor after an insert, whichever affordance
        // did the inserting — a toolbar chip, a picker, a dictation button.
        { onUpdate: () => editor.focus() },
      );
    },
    [editor],
  );
}

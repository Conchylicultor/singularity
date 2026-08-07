import { useCallback } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { useMergedNodeExtensions } from "../slots";
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
  // Read fresh at insert time: the extension set is boot-stable but its array
  // identity churns each render, and it must not re-key the callback.
  const extensionsRef = useLatestRef(useMergedNodeExtensions());
  return useCallback(
    (text: string) => {
      editor.update(
        () => {
          $insertMarkdownSnippet(text, extensionsRef.current);
        },
        // The caret belongs in the editor after an insert, whichever affordance
        // did the inserting — a toolbar chip, a picker, a dictation button.
        { onUpdate: () => editor.focus() },
      );
    },
    [editor, extensionsRef],
  );
}

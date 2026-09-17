import { useCallback } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createParagraphNode, $getRoot } from "lexical";
import { getNodeExtensions } from "./node-extensions";
import { $insertMarkdownSnippet, $serializeRootToMarkdown } from "./markdown";

/**
 * Insert a markdown snippet at the caret, then hand back the whole draft and
 * empty the editor — "insert, then send" as one step.
 *
 * The insert is the same one {@link useInsertMarkdown} performs, so a snippet
 * sent this way lands exactly where the insert-only path would have put it
 * (at the caret, or the end when there is none). The draft comes back
 * serialized, so tokens (chips, images) survive as their source text.
 *
 * One discrete update: the insert, the read and the clear see the same state,
 * and the returned text is final by the time the call returns.
 *
 * Must be called inside a `LexicalComposer` (the editor's own subtree).
 */
export function useTakeMarkdownWith(): (snippet: string) => string {
  const [editor] = useLexicalComposerContext();
  return useCallback(
    (snippet: string) => {
      let markdown = "";
      editor.update(
        () => {
          const extensions = getNodeExtensions();
          $insertMarkdownSnippet(snippet, extensions);
          markdown = $serializeRootToMarkdown(extensions);
          const root = $getRoot();
          root.clear();
          root.append($createParagraphNode());
        },
        { discrete: true },
      );
      return markdown;
    },
    [editor],
  );
}

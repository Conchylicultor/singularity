import { useEffect, useMemo } from "react";
import { COMMAND_PRIORITY_NORMAL, PASTE_COMMAND } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { parseMarkdownToForest, type SerializedBlock } from "../../core";
import { useBlockEditor } from "../block-editor-context";
import { Editor } from "../slots";
import type { BlockTextPluginProps } from "../internal/block-text-extensions";
import { resolvePastedBlock } from "../internal/block-paste-handlers";
import { BLOCKS_MIME, decidePaste } from "../internal/clipboard";

/**
 * Invisible Lexical plugin that makes a caret-in-block paste honor the block
 * clipboard, so it matches the block-selection-mode container paste
 * (`block-editor.tsx`). Without it, Lexical's default RichText paste dumps a
 * copied forest's `text/plain` fallback into ONE block's Y.Doc, breaking
 * one-paragraph-per-block. On `PASTE_COMMAND` it resolves the clipboard shape via
 * `decidePaste`:
 *  - a pasted FILE → `return false` (BlockPastePlugin owns it; the early bail
 *    makes registration order irrelevant);
 *  - a `BLOCKS_MIME` forest → `preventDefault`, parse it, and `paste` the blocks
 *    after this block;
 *  - multi-line `text/plain` → `preventDefault` and `paste` the markdown parsed
 *    into a forest;
 *  - single-line text → `return false` (native inline paste is left untouched).
 *
 * Registered at `COMMAND_PRIORITY_NORMAL` (like BlockPastePlugin) so multi-line /
 * forest pastes beat the bare-URL handler (LOW) and the default RichText paste
 * (LOW). An empty parsed forest (whitespace-only multi-line text) declines
 * without `preventDefault`, so the event is never swallowed for nothing.
 */
export function BlockForestPastePlugin({ block }: BlockTextPluginProps) {
  const [lexical] = useLexicalComposerContext();
  const { paste } = useBlockEditor();
  const contributions = Editor.Block.useContributions();
  const handles = useMemo(() => contributions.map((c) => c.block), [contributions]);

  useEffect(() => {
    return lexical.registerCommand<ClipboardEvent>(
      PASTE_COMMAND,
      (event) => {
        const clipboard = event.clipboardData;
        if (!clipboard) return false;
        const decision = decidePaste({
          isFile: resolvePastedBlock(clipboard) !== null,
          blocksJson: clipboard.getData(BLOCKS_MIME),
          plainText: clipboard.getData("text/plain"),
        });
        if (decision.kind === "defer" || decision.kind === "default") return false;

        let forest: SerializedBlock[];
        if (decision.kind === "forest") {
          try {
            forest = JSON.parse(decision.json) as SerializedBlock[];
          } catch (err) {
            // Mirror the container handler's tolerance: a malformed payload is
            // not our paste — fall through to the default.
            if (!(err instanceof SyntaxError)) throw err;
            return false;
          }
        } else {
          forest = parseMarkdownToForest(decision.text, handles);
        }
        // Empty/unparseable forest (e.g. whitespace-only multi-line) → let the
        // native paste run; never swallow the event for nothing.
        if (!Array.isArray(forest) || forest.length === 0) return false;

        event.preventDefault();
        void paste({ blocks: forest, afterId: block.id });
        return true;
      },
      COMMAND_PRIORITY_NORMAL,
    );
  }, [lexical, block, paste, handles]);

  return null;
}

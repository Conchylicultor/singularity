import { useEffect } from "react";
import { COMMAND_PRIORITY_NORMAL, PASTE_COMMAND } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { textOf } from "../../core";
import type { BlockTextPluginProps } from "../internal/block-text-extensions";
import { resolvePastedBlock } from "../internal/block-paste-handlers";

/**
 * Invisible Lexical plugin that turns a pasted file into an attachment block.
 * On `PASTE_COMMAND`, if the clipboard carries a file matching a registered
 * block-paste handler, we `preventDefault`, upload it, and either convert an
 * empty block in place or insert a new block after a non-empty one. Files that
 * match no handler fall through (return false), so url-paste / the default
 * RichText paste still run. Registered at `COMMAND_PRIORITY_NORMAL` so it beats
 * the default RichText paste (LOW) for files.
 */
export function BlockPastePlugin({ block, editor }: BlockTextPluginProps) {
  const [lexical] = useLexicalComposerContext();
  useEffect(() => {
    return lexical.registerCommand<ClipboardEvent>(
      PASTE_COMMAND,
      (event) => {
        const picked = resolvePastedBlock(event.clipboardData);
        if (!picked) return false; // not a pasted file → let url-paste / default run
        event.preventDefault();
        const { file, handler } = picked;
        const empty = textOf(block).trim() === "";
        void (async () => {
          const data = await handler.build(file);
          // Empty block → convert it in place; otherwise insert a new block after.
          if (empty) editor.convertTo(handler.type, data);
          else editor.insertAfter(handler.type, data);
        })();
        return true;
      },
      COMMAND_PRIORITY_NORMAL, // beats the default RichText paste (LOW) for files
    );
  }, [lexical, block, editor]);
  return null;
}

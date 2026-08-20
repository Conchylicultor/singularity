import { useEffect, useMemo } from "react";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_NORMAL,
  COPY_COMMAND,
  CUT_COMMAND,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useBlockEditor } from "../block-editor-context";
import { Editor } from "../slots";
import type { BlockTextPluginProps } from "../internal/block-text-extensions";
import { writeForestToClipboard } from "../internal/clipboard-write";
import { serializeForest } from "../serialize-blocks";

/**
 * Invisible Lexical plugin giving the caret-in-block clipboard its missing half:
 *
 * > With NOTHING selected, the caret's own block IS the selection.
 *
 * So Cmd/Ctrl+C on a caret copies the whole block (and its subtree), Cmd/Ctrl+X
 * copies it and removes it, and the existing `BlockForestPastePlugin` lands the
 * result after the block the caret is in — which is what makes "copy, paste,
 * duplicated" a two-keystroke gesture without ever leaving the text. It is the
 * caret twin of block-selection mode's `onCopy`/`onCut` (`block-editor.tsx`) and
 * writes the identical clipboard payload through `writeForestToClipboard`.
 *
 * **A real text range is still the user's**: a non-collapsed selection declines
 * (`return false`) and the browser's own copy/cut runs untouched, marks and all.
 * Only the collapsed case — where the native copy has nothing to copy and is a
 * silent no-op — is claimed. That single condition is the whole rule; there is no
 * modifier to learn and nothing to toggle.
 *
 * Registered at `COMMAND_PRIORITY_NORMAL`, above `@lexical/rich-text`'s own
 * copy/cut handlers (`COMMAND_PRIORITY_EDITOR`), the same rung
 * `BlockForestPastePlugin` uses on the paste side.
 *
 * Scope note: it copies the block the CARET is in, never the container that
 * block may sit inside. The rail's menu resolves to the seat's owner instead —
 * deliberately: the rail acts on a line's structure, the keyboard acts on the
 * line you are standing in. To copy a whole container, select it as a block.
 */
export function BlockForestCopyPlugin({ block, editor }: BlockTextPluginProps) {
  const [lexical] = useLexicalComposerContext();
  const { rowsRef } = useBlockEditor();
  const contributions = Editor.Block.useContributions();
  const handles = useMemo(
    () => contributions.map((c) => c.block),
    [contributions],
  );

  useEffect(() => {
    /**
     * Substitute this block's serialized subtree for whatever the native
     * copy/cut would have written. Returns whether it claimed the event, so
     * `CUT_COMMAND` only deletes on the branch that actually copied — a cut that
     * failed to reach the clipboard must not destroy the block.
     */
    const writeBlock = (event: ClipboardEvent): boolean => {
      const selection = $getSelection();
      // A text range (or a node selection inside the block) belongs to the
      // browser; only a collapsed caret means "the whole block".
      if (!$isRangeSelection(selection) || !selection.isCollapsed())
        return false;
      const clipboardData = event.clipboardData;
      if (clipboardData === null) return false;
      const forest = serializeForest(rowsRef.current, [block.id]);
      // The row is gone from under the caret (a concurrent delete): decline
      // rather than write an empty clipboard over what the user had.
      if (forest.length === 0) return false;
      writeForestToClipboard(clipboardData, forest, handles);
      event.preventDefault();
      return true;
    };

    const unregister = [
      lexical.registerCommand<ClipboardEvent>(
        COPY_COMMAND,
        writeBlock,
        COMMAND_PRIORITY_NORMAL,
      ),
      lexical.registerCommand<ClipboardEvent>(
        CUT_COMMAND,
        (event) => {
          if (!writeBlock(event)) return false;
          // The same structural delete the rail menu's Delete runs, so the caret
          // lands where a delete always lands and the cut is one undo entry.
          editor.remove();
          return true;
        },
        COMMAND_PRIORITY_NORMAL,
      ),
    ];
    return () => {
      for (const u of unregister) u();
    };
  }, [lexical, block.id, editor, rowsRef, handles]);

  return null;
}

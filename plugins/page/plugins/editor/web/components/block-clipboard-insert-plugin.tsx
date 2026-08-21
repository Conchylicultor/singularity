import { useEffect } from "react";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_NORMAL,
  SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $flattenToInline,
  isBlockLevel,
} from "../internal/inline-clipboard-nodes";

/**
 * Invisible Lexical plugin enforcing the block editor's structural invariant at
 * the one door a clipboard-generated node graph goes through:
 *
 * > A block IS one paragraph. Content pasted or dropped into it lands INSIDE
 * > that paragraph — never beside it.
 *
 * `SELECTION_INSERT_CLIPBOARD_NODES_COMMAND` is Lexical's own seam for this
 * question ("what does this editor do with clipboard-generated nodes?"), and
 * `$insertDataTransferForRichText` dispatches it whichever MARKUP flavor it
 * parsed (`application/x-lexical-editor`, `text/html`) and for every gesture
 * that reaches that function — paste, drop, and the controlled text insertion
 * behind an IME/autofill. Guarding there rather than at `PASTE_COMMAND` is what
 * makes the rule hold across all of those instead of the ones we listed.
 *
 * It does not cover that function's third arm, the plain-text fallback, which
 * calls `selection.insertParagraph()` per newline and dispatches no command at
 * all — nothing here can reach it. That arm is closed the other way, by making
 * it unreachable WITH A NEWLINE IN IT: `decideTransfer` (`internal/transfer.ts`)
 * classifies every transfer entering the page before the gesture gets there, and
 * sends multi-line text to `paste` as a block forest — on a caret paste, on a
 * block-selection paste, and (since the container claims the drop before its
 * default action can fire `beforeinput`/`insertFromDrop`) on a DROP. Two halves,
 * one invariant: markup arms guarded here, plain-text arm classified away.
 *
 * It claims the insert ONLY when the payload actually carries block structure —
 * `isBlockLevel` is `RangeSelection.insertNodes`' OWN predicate for taking its
 * paragraph-splitting branch. An all-inline payload (the overwhelmingly common
 * case) declines, so the ordinary paste keeps Lexical's exact behaviour.
 *
 * Why block structure can reach a per-block paste at all: `decideTransfer`
 * classifies from `text/plain`; `text/html` is written by whatever app the user
 * copied from and need not agree with it. A single-line `text/plain` beside a
 * multi-paragraph `text/html` is ordinary output from real editors. Before this,
 * that pasted a SECOND paragraph into the block's root — a node graph nothing
 * else in the editor can produce, and one every caret, split and merge rule is
 * written against the absence of.
 */
export function BlockClipboardInsertPlugin() {
  const [lexical] = useLexicalComposerContext();

  useEffect(() => {
    return lexical.registerCommand(
      SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
      ({ nodes, selection }) => {
        if (!$isRangeSelection(selection)) return false;
        // No block structure → Lexical's own inline splice is already right.
        if (!nodes.some(isBlockLevel)) return false;
        const content = $flattenToInline(nodes);
        switch (content.kind) {
          case "not-inline":
            // Nothing inline can express it: decline, and let the default insert
            // run as it always did rather than drop the user's content.
            return false;
          case "empty":
            // Block structure carrying nothing (`<p></p>`). It inserts nothing,
            // but a paste of nothing still REPLACES what was selected — which
            // `insertNodes` would have done and an early return would not.
            selection.removeText();
            return true;
          case "inline":
            selection.insertNodes(content.nodes);
            $carryPastedFormatToCaret();
            return true;
        }
      },
      COMMAND_PRIORITY_NORMAL,
    );
  }, [lexical]);

  return null;
}

/**
 * Continue typing in the marks of the run that was just pasted.
 *
 * Lexical follows its own insert with `$updateSelectionOnInsert`, which does
 * exactly this — and claiming the command skips it, which would leave the two
 * arms of this plugin disagreeing about something the user feels immediately.
 * It is not exported, so the rule is restated here over the position
 * `insertNodes` actually parked the caret at: the end of the last inserted leaf.
 */
function $carryPastedFormatToCaret(): void {
  const landed = $getSelection();
  if (!$isRangeSelection(landed) || !landed.isCollapsed()) return;
  if (landed.anchor.type !== "text") return;
  const node = landed.anchor.getNode();
  if (!$isTextNode(node)) return;
  landed.setFormat(node.getFormat());
  landed.setStyle(node.getStyle());
}

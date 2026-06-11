import { useEffect } from "react";
import {
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isRangeSelection,
  $createParagraphNode,
  COMMAND_PRIORITY_NORMAL,
  KEY_ENTER_COMMAND,
  LineBreakNode,
  type LexicalNode,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

// Enforces the invariant: an *inline* decorator node (e.g. a pasted image) must
// begin a paragraph block — it must never sit immediately after a LineBreakNode
// within a paragraph.
//
// Why: a caret cannot rest immediately before an inline contenteditable=false
// decorator that merely follows a line break — Chromium exposes no DOM text
// position there, so the caret (and any subsequent typing) collapses back onto
// the end of the previous line. When the decorator instead starts a block, a
// caret position before it exists, so navigating/typing in front of it works.
//
// This costs nothing on save: the markdown model already round-trips every
// newline as a separate paragraph, so a line break before a decorator and a
// paragraph break before a decorator serialize identically.
//
// Two hooks enforce the invariant across every path:
//   1. Enter key — split into a new paragraph instead of inserting a line break,
//      with explicit caret placement. (A transform alone cannot fix this: the
//      default handler commits a caret at an unanchorable element point first,
//      and a transform must not reach into selection.)
//   2. A node transform — heals the structure for every other path (paste, drop,
//      programmatic insertion). Here the selection is anchored to the decorator
//      node itself, so it follows the node through the split for free.
//
// Lives in the editor core so every inline decorator — present and future —
// benefits, rather than each node plugin reimplementing it.
export function DecoratorBlockPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // NORMAL priority: below the HIGH-priority submit handler (Cmd/Ctrl+Enter
    // still submits) and above the EDITOR-priority default line-break handler
    // (we pre-empt it only for the decorator-adjacent case).
    const unregisterEnter = editor.registerCommand<KeyboardEvent | null>(
      KEY_ENTER_COMMAND,
      splitParagraphBeforeAdjacentDecorator,
      COMMAND_PRIORITY_NORMAL,
    );
    const unregisterTransform = editor.registerNodeTransform(
      LineBreakNode,
      hoistDecoratorAfterLineBreakToNewBlock,
    );
    return () => {
      unregisterEnter();
      unregisterTransform();
    };
  }, [editor]);

  return null;
}

function $isInlineDecorator(node: LexicalNode | null): boolean {
  return $isDecoratorNode(node) && node.isInline();
}

// Enter with the caret directly in front of an inline decorator: split into a
// fresh paragraph (moving the decorator to a new block) instead of inserting a
// line break. insertParagraph() lands the caret at the start of the new block,
// in front of the decorator.
function splitParagraphBeforeAdjacentDecorator(
  event: KeyboardEvent | null,
): boolean {
  // Leave submit chords (Cmd/Ctrl+Enter) to the submit handler.
  if (event && (event.metaKey || event.ctrlKey)) return false;
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const anchor = selection.anchor;
  const node = anchor.getNode();
  let after;
  if (anchor.type === "text") {
    // Only when the caret sits at the very end of the text node, i.e. directly
    // in front of the following sibling.
    if (anchor.offset !== node.getTextContentSize()) return false;
    after = node.getNextSibling();
  } else if ($isElementNode(node)) {
    after = node.getChildAtIndex(anchor.offset);
  } else {
    return false;
  }
  if (!$isInlineDecorator(after)) return false;
  event?.preventDefault();
  selection.insertParagraph();
  return true;
}

// Structural healer: when an inline decorator directly follows a line break,
// drop the line break and move the decorator (plus everything after it on that
// line) into a new paragraph, so the decorator starts a block.
function hoistDecoratorAfterLineBreakToNewBlock(lineBreak: LineBreakNode): void {
  const next = lineBreak.getNextSibling();
  if (!$isInlineDecorator(next)) return;
  const parent = lineBreak.getParentOrThrow();
  const newParagraph = $createParagraphNode();
  const moved: LexicalNode[] = [];
  for (let n = next; n !== null; n = n.getNextSibling()) moved.push(n);
  lineBreak.remove();
  for (const n of moved) newParagraph.append(n);
  parent.insertAfter(newParagraph);
}

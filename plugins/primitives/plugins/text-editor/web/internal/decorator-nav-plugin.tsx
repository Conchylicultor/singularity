import { useEffect } from "react";
import {
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

// Caret navigation across an inline decorator node (e.g. a pasted image).
// Lexical's default plain-text arrow handler delegates to the native
// Selection.modify, which in Chromium refuses to step across an inline
// contenteditable=false decorator span — so the caret gets stuck on one side
// of the node. The default handler still consumes the event, so a lower
// priority can't recover. We run before it (EDITOR priority is the lowest) and
// step the caret across the decorator explicitly with Lexical node APIs.
//
// This lives in the editor core rather than any one node plugin so every inline
// decorator — present and future — is keyboard-navigable for free.
export function DecoratorNavPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const cross = (isBackward: boolean) => (event: KeyboardEvent) =>
      crossAdjacentDecorator(isBackward, event);
    const unregisterLeft = editor.registerCommand<KeyboardEvent>(
      KEY_ARROW_LEFT_COMMAND,
      cross(true),
      COMMAND_PRIORITY_HIGH,
    );
    const unregisterRight = editor.registerCommand<KeyboardEvent>(
      KEY_ARROW_RIGHT_COMMAND,
      cross(false),
      COMMAND_PRIORITY_HIGH,
    );
    return () => {
      unregisterLeft();
      unregisterRight();
    };
  }, [editor]);

  return null;
}

// Move a collapsed caret to the far side of an inline decorator sitting directly
// next to it, in the direction of travel. Returns true (and consumes the key)
// only when a decorator is actually crossed; otherwise the default handler runs.
function crossAdjacentDecorator(
  isBackward: boolean,
  event: KeyboardEvent,
): boolean {
  const selection = $getSelection();
  if (
    !$isRangeSelection(selection) ||
    !selection.isCollapsed() ||
    event.shiftKey
  ) {
    return false;
  }
  const anchor = selection.anchor;
  const node = anchor.getNode();
  let adjacent;
  if (anchor.type === "text") {
    const atEdge = isBackward
      ? anchor.offset === 0
      : anchor.offset === node.getTextContentSize();
    if (!atEdge) return false;
    adjacent = isBackward ? node.getPreviousSibling() : node.getNextSibling();
  } else if ($isElementNode(node)) {
    adjacent = node.getChildAtIndex(isBackward ? anchor.offset - 1 : anchor.offset);
  } else {
    return false;
  }
  if (!$isDecoratorNode(adjacent) || !adjacent.isInline()) return false;
  event.preventDefault();
  if (isBackward) adjacent.selectPrevious();
  else adjacent.selectNext();
  return true;
}

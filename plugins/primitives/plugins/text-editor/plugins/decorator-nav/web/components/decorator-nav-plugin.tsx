import { useEffect } from "react";
import {
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  type LexicalEditor,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { crossCaret } from "@plugins/primitives/plugins/text-editor/plugins/caret-motion/web";

// Caret navigation across an inline decorator node (e.g. a pasted image, a
// `@date` chip). Chromium will not step a caret across an inline
// contenteditable=false span in one press: the intermediate stop is the
// ELEMENT-boundary position beside the span, at which no caret is painted — so
// the caret appears to vanish and only reappears on the second press. We run at
// HIGH priority and step across the decorator explicitly with Lexical node APIs,
// landing on the far side in one press.
//
// This is its own plugin rather than an internal of any one editor because there
// is more than one Lexical host in the app (the generic text editor and the page
// block editor), and inline decorators are contributed by yet other plugins. A
// fix that lives inside one host silently does not exist in the other — which is
// exactly how the page editor's `@date` chips ended up un-crossable while the
// same chip class worked in the prompt editor. Both hosts mount this; every
// inline decorator — present and future — is keyboard-navigable for free.
//
// KNOWN BOUND: when the decorator is the FIRST or LAST thing in its paragraph
// there is no text position on the far side to land on, so the caret still ends
// up at the unpainted element boundary. Fixing that needs a caret seam (a
// zero-width text node) in the decorator contract itself, not a key handler.
export function DecoratorNavPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const cross = (isBackward: boolean) => (event: KeyboardEvent) =>
      crossAdjacentDecorator(editor, isBackward, event);
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
  editor: LexicalEditor,
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
    adjacent = node.getChildAtIndex(
      isBackward ? anchor.offset - 1 : anchor.offset,
    );
  } else {
    return false;
  }
  if (!$isDecoratorNode(adjacent) || !adjacent.isInline()) return false;
  const decorator = adjacent;
  event.preventDefault();
  // The move and the announcement are ONE act: a consumer of a synthesized caret
  // position (the page editor's inline-mark boundary) has to be told the caret
  // arrived here by CROSSING something, because it cannot tell that from the
  // selection alone. See the caret-motion plugin.
  crossCaret(editor, isBackward ? "left" : "right", () => {
    // `selectPrevious()` stays argument-less ON PURPOSE — its default IS the end
    // of the previous node, which is the correct leftward landing. Do NOT
    // "fix" it symmetrically to (0, 0), which would jump to that node's start.
    //
    // `selectNext` MUST pass (0, 0). It forwards its arguments to
    // `nextSibling.select(...)`, and `TextNode.select` defaults an undefined
    // offset to `text.length` — so an argument-less call lands ArrowRight at the
    // END of the whole text run following the chip, silently skipping it.
    // `page/editor`'s `web/internal/caret-geometry.ts:656` already passes
    // (0, 0) explicitly for the same reason.
    if (isBackward) decorator.selectPrevious();
    else decorator.selectNext(0, 0);
  });
  return true;
}

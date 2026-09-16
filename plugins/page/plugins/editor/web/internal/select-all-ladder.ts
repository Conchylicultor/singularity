/**
 * Cmd/Ctrl+A in a page is a two-step ladder, like Notion: the first press
 * selects the text the caret is in, and once there is no more text to select
 * the press selects every block on the page.
 *
 * A Lexical text block answers the question itself (`KeyboardPlugin`), because
 * only its editor state knows what is selected. Every OTHER caret — a void
 * block's box, a sub-page row, a page-link row, a code block's or an equation's
 * `<textarea>`, an `<input>` inside a media block — is answered once, on the
 * row (`BlockRow`), with the two functions below.
 */

/** Is this keystroke Cmd+A (macOS) / Ctrl+A, with no other modifier? */
export function isSelectAllKey(e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return (
    (e.metaKey || e.ctrlKey) &&
    !e.shiftKey &&
    !e.altKey &&
    e.key.toLowerCase() === "a"
  );
}

/**
 * Does a native text control still have text for Cmd+A to select? Only then is
 * the press the control's own (the ladder's first rung). Anything that is not a
 * text control — a button, a focusable box — has nothing to select, so the
 * press goes straight to every block.
 */
export function hasTextLeftToSelect(target: EventTarget | null): boolean {
  if (
    !(target instanceof HTMLTextAreaElement) &&
    !(target instanceof HTMLInputElement)
  ) {
    return false;
  }
  const { value, selectionStart, selectionEnd } = target;
  // An `<input type="checkbox">` (and friends) has no text selection at all.
  if (selectionStart === null || selectionEnd === null) return false;
  if (value === "") return false;
  return !(selectionStart === 0 && selectionEnd === value.length);
}

/**
 * Which undo history owns a keystroke that lands in a given DOM subtree.
 *
 * A tab has ONE surface stack, but it is not the only undo history on screen:
 * every native `<input>`/`<textarea>` keeps its own, and so does every Lexical
 * editor that mounts `HistoryPlugin` (the generic `TextEditor` primitive — the
 * prompt editor, the task description, the draft form). Those histories are
 * driven by the SAME `mod+z`, so the surface binding must know when to stay out
 * of the way: a ⌘Z typed in the agent prompt is an edit to the prompt, and must
 * not also reverse the last block edit in a page rendered beside it.
 *
 * The resolution is by NEAREST declaring ancestor, so the two can nest either
 * way round (a `TextEditor` embedded in a page block owns its own history even
 * though the page body around it delegates to the surface).
 */
export type UndoOwner = "surface" | "local";

/** The DOM attribute a subtree declares its undo owner with. */
export const UNDO_OWNER_ATTR = "data-undo-owner";

/**
 * Spread onto the root of a region whose edits are recorded on the SURFACE
 * stack (`useUndoRedo().record`) rather than in a history of its own — so
 * `mod+z` typed inside it drives the surface stack even though the caret is in
 * an editing host. The page block editor is the canonical case: it deliberately
 * has no per-block Lexical history, precisely so undo is one document-level
 * stack.
 */
export const surfaceUndoProps = { [UNDO_OWNER_ATTR]: "surface" } as const;

/**
 * Spread onto an editor that keeps its OWN undo history, to claim `mod+z` back
 * from an enclosing {@link surfaceUndoProps} region. Only needed for a nested
 * editor: an undeclared editable already resolves to `local` (see
 * {@link resolveUndoOwner}), so plain inputs and textareas need no marker.
 */
export const localUndoProps = { [UNDO_OWNER_ATTR]: "local" } as const;

/**
 * Input types the browser keeps an undo stack for. Deliberately NOT
 * `shortcuts`' `isEditableTarget`, which answers a different question ("should
 * the raw keystroke reach this element") and so counts a checkbox, a radio and
 * a file picker as editable. Those have no text history to protect, and
 * treating them as if they did would silence ⌘Z right after ticking a checkbox
 * — the one moment the user most wants to take it back.
 */
const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "number",
]);

function keepsOwnTextHistory(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement)
    return TEXT_INPUT_TYPES.has(target.type);
  return false;
}

/**
 * Who owns `mod+z` for this keystroke's target.
 *
 * Undeclared subtrees fall back on the safe reading: a text field keeps its own
 * (native or library) history, and anything else is chrome, whose undo is the
 * surface's. That default is what makes the marker opt-in — forgetting one
 * costs a keystroke that stays inside the field the user is typing in, never a
 * document silently rewound behind their back.
 */
export function resolveUndoOwner(target: EventTarget | null): UndoOwner {
  const declared =
    target instanceof Element ? target.closest(`[${UNDO_OWNER_ATTR}]`) : null;
  const declaration = declared?.getAttribute(UNDO_OWNER_ATTR);
  if (declaration === "surface" || declaration === "local") return declaration;
  if (declaration !== null && declaration !== undefined) {
    throw new Error(
      `[undo-redo] ${UNDO_OWNER_ATTR}="${declaration}" is not an undo owner. ` +
        `Spread surfaceUndoProps or localUndoProps instead of writing the attribute by hand.`,
    );
  }
  return keepsOwnTextHistory(target) ? "local" : "surface";
}

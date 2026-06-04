import type { ParsedCombo } from "./types";

/**
 * Is the event target an editable element that should receive the raw
 * keystroke (text input, textarea, native select, or a contenteditable host)?
 *
 * When true, plain-key shortcuts must yield so the key reaches the field —
 * pressing space in a prompt editor should insert a space, not toggle playback.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return true;
  return false;
}

/**
 * Does this combo carry a non-shift modifier? Modifier combos (Cmd/Ctrl/Alt)
 * are deliberate commands that should still fire while typing (e.g. Cmd+K,
 * Cmd+Enter). Shift alone is not a modifier here — shift+key is still typing.
 */
export function comboHasModifier(combo: ParsedCombo): boolean {
  return combo.mod || combo.ctrl || combo.alt;
}

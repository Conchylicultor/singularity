import { useEffect } from "react";
import {
  FORMAT_TEXT_COMMAND,
  KEY_DOWN_COMMAND,
  COMMAND_PRIORITY_NORMAL,
  type TextFormatType,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { OPEN_LINK_POPOVER_COMMAND } from "../internal/link-command";

/**
 * Closed keyboard-shortcut set for the inline marks. Always mounted (independent
 * of toolbar visibility) so the shortcuts work with a collapsed caret too —
 * Lexical toggles the format for subsequently typed text, the standard editor
 * behavior, which the floating toolbar (range-only) cannot cover.
 *
 * Ownership: we register the FULL set explicitly and consume each match
 * (`return true`), rather than relying on Lexical's built-in Cmd+B/I/U. Lexical
 * only wires bold/italic/underline; code and strikethrough have no built-in.
 * Owning all five in one place keeps the shortcut map a single closed source of
 * truth and avoids a split between "framework defaults" and "ours".
 *
 * THE COMMAND IS `KEY_DOWN_COMMAND`, AND THAT IS THE WHOLE MECHANISM — DO NOT
 * MOVE IT BACK TO `KEY_MODIFIER_COMMAND`. This handler used to listen on
 * `KEY_MODIFIER_COMMAND`, on the theory that consuming it stopped the framework
 * default. It does not, and cannot: in `lexical@0.44.0` (`Lexical.dev.mjs`)
 * `$handleKeyDown` — the built-in `KEY_DOWN_COMMAND` listener, registered at
 * `COMMAND_PRIORITY_EDITOR` (:2430) — dispatches `FORMAT_TEXT_COMMAND` from its
 * own `isBold` / `isUnderline` / `isItalic` branches (:2938-2946) and only THEN,
 * outside that if/else chain, dispatches `KEY_MODIFIER_COMMAND` (:2974-2976). So
 * ⌘B produced two `FORMAT_TEXT_COMMAND('bold')` dispatches — Lexical's, then
 * ours — which toggled the mark on and straight back off. ⌘B, ⌘I and ⌘U applied
 * nothing at all for as long as that registration stood, while ⌘E and ⌘⇧X (no
 * built-in branch, so one dispatch) worked.
 *
 * Listening on `KEY_DOWN_COMMAND` at `COMMAND_PRIORITY_NORMAL` makes the claim
 * true instead of aspirational: `triggerCommandListeners` walks priorities 4 → 0
 * and stops at the first listener returning `true` (:8912-8929), so consuming
 * here preempts the ENTIRE built-in chain — the format branch and the trailing
 * `KEY_MODIFIER_COMMAND` dispatch alike. Exactly one dispatch per shortcut, ours.
 * Spec: `e2e/format-shortcuts-verify.ts`.
 */
const SHORTCUTS: { key: string; shift: boolean; format: TextFormatType }[] = [
  { key: "b", shift: false, format: "bold" },
  { key: "i", shift: false, format: "italic" },
  { key: "u", shift: false, format: "underline" },
  { key: "e", shift: false, format: "code" },
  { key: "x", shift: true, format: "strikethrough" },
];

export function FormatShortcutsPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        // Cmd (mac) or Ctrl (win/linux) only; ignore Alt to avoid clobbering
        // accented-character / compose input. Checked first because this
        // listener now sees EVERY keystroke, not only modified ones.
        const mod = event.metaKey || event.ctrlKey;
        if (!mod || event.altKey) return false;
        const key = event.key.toLowerCase();
        // ⌘K → open the link popover (handled by the link toolbar button, which
        // is mounted whenever a range selection shows the bar). A collapsed caret
        // simply has no bar/button, so ⌘K is a clean no-op there.
        //
        // ⌘K is also the global command-palette shortcut (a window-level keydown
        // listener). Because this handler runs from the editor's own (bubbling)
        // keydown before the event reaches `window`, stopping propagation here
        // makes the editor win ⌘K *only while a block editor is focused* — the
        // palette still owns ⌘K everywhere else.
        if (key === "k" && !event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          editor.dispatchCommand(OPEN_LINK_POPOVER_COMMAND, undefined);
          return true;
        }
        for (const sc of SHORTCUTS) {
          if (sc.key === key && sc.shift === event.shiftKey) {
            event.preventDefault();
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, sc.format);
            return true;
          }
        }
        return false;
      },
      COMMAND_PRIORITY_NORMAL,
    );
  }, [editor]);

  return null;
}

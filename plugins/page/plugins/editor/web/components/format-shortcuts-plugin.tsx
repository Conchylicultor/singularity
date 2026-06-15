import { useEffect } from "react";
import {
  FORMAT_TEXT_COMMAND,
  KEY_MODIFIER_COMMAND,
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
 * Ownership: we register the FULL set explicitly via `KEY_MODIFIER_COMMAND` and
 * consume each match (`return true`), rather than relying on `RichTextPlugin`'s
 * built-in Cmd+B/I/U. `RichTextPlugin` only wires bold/italic/underline; code and
 * strikethrough have no built-in. Owning all five in one place keeps the shortcut
 * map a single closed source of truth and avoids a split between "framework
 * defaults" and "ours". Because this handler returns `true` for the marks it
 * owns, the framework default never double-fires.
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
      KEY_MODIFIER_COMMAND,
      (event: KeyboardEvent) => {
        // Cmd (mac) or Ctrl (win/linux) only; ignore Alt to avoid clobbering
        // accented-character / compose input.
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

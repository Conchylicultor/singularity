import { useEffect } from "react";
import { COMMAND_PRIORITY_HIGH, KEY_ENTER_COMMAND } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

// Enter-to-submit. `submitMode === "enter"` fires onSubmit on plain Enter
// (Shift+Enter inserts a newline). `submitMode === "cmd-enter"` fires on
// Cmd/Ctrl+Enter; plain Enter inserts a newline as usual.
export function EnterKeyPlugin({
  onSubmit,
  submitMode,
}: {
  onSubmit: () => void;
  submitMode: "enter" | "cmd-enter";
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand<KeyboardEvent | null>(
      KEY_ENTER_COMMAND,
      (event) => {
        if (!event) return false;
        if (event.isComposing) return false;
        if (submitMode === "enter") {
          if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
            return false;
          }
          event.preventDefault();
          onSubmit();
          return true;
        }
        // cmd-enter
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          onSubmit();
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onSubmit, submitMode]);

  return null;
}

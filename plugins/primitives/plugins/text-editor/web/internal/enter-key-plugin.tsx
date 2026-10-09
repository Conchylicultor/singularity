import { useEffect } from "react";
import { COMMAND_PRIORITY_HIGH, KEY_ENTER_COMMAND } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

/**
 * ⌘/Ctrl+Enter submits in every submit mode, so the same muscle memory works
 * in every composer; `"enter"` additionally submits on a bare Enter (Shift /
 * Alt+Enter still insert a newline there).
 */
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
        const modSubmit = event.metaKey || event.ctrlKey;
        const bareSubmit =
          submitMode === "enter" && !event.shiftKey && !event.altKey;
        if (!modSubmit && !bareSubmit) return false;
        event.preventDefault();
        onSubmit();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onSubmit, submitMode]);

  return null;
}

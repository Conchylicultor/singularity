import { useEffect } from "react";
import { COMMAND_PRIORITY_HIGH, KEY_ENTER_COMMAND } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

export function EnterKeyPlugin({ onSend }: { onSend: () => void }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand<KeyboardEvent | null>(
      KEY_ENTER_COMMAND,
      (event) => {
        if (!event) return false;
        if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
          return false;
        }
        // IME composition — let it through.
        if (event.isComposing) return false;
        event.preventDefault();
        onSend();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onSend]);

  return null;
}

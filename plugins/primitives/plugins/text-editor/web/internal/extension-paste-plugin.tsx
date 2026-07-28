import { useEffect } from "react";
import { COMMAND_PRIORITY_LOW, PASTE_COMMAND } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import type { NodeExtension } from "./node-extensions";
import { $insertMarkdownSnippet, hasNodeExtensionToken } from "./markdown";

// Pasting text that carries a node-extension token (`<ui-context …>`, an inline
// active-data tag, attachment image markdown, …) materializes the node, exactly
// as the same text would through the value round-trip or the imperative caret
// insert. Without this, the default plain-text paste drops the token in as
// literal characters and it stays literal: the paste re-serializes to the very
// value the sync plugin already believes is applied, so nothing ever
// re-deserializes it.
//
// Lives in the editor core and reads the generic extension registry, so every
// extension — present and future — is pasteable without its own wiring.
//
// LOW priority: below the NORMAL-priority image/file paste handlers (an image
// paste is still an upload, never text) and above the EDITOR-priority default
// insert, which keeps handling every paste with no token in it.
export function ExtensionPastePlugin({
  extensions,
}: {
  extensions: readonly NodeExtension[];
}) {
  const [editor] = useLexicalComposerContext();
  const extensionsRef = useLatestRef(extensions);

  useEffect(() => {
    return editor.registerCommand<ClipboardEvent>(
      PASTE_COMMAND,
      (event) => {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        const exts = extensionsRef.current;
        if (!text || !hasNodeExtensionToken(text, exts)) return false;
        event.preventDefault();
        // Command listeners already run inside an `editor.update()`.
        $insertMarkdownSnippet(text, exts);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, extensionsRef]);

  return null;
}

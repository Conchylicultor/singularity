import { useEffect } from "react";
import { COMMAND_PRIORITY_LOW, PASTE_COMMAND } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import {
  hasToken,
  type InlineTokenExtension,
} from "@plugins/primitives/plugins/text-editor/plugins/token-extension/core";
import { $insertTokenizedText } from "../../core";

/** Lexical's own clipboard flavor, carrying a serialized node payload. */
const LEXICAL_MIME = "application/x-lexical-editor";

/**
 * Pasting text that carries an inline token materializes the token as its node,
 * exactly as the same text would through a value round-trip or an imperative
 * caret insert. Without this, the default plain-text paste drops the token in as
 * literal characters and it stays literal forever — nothing re-scans text that
 * is already in the document.
 *
 * Registry-driven, so every token family — present and future — is pasteable
 * with no wiring of its own.
 *
 * ## It declines an intra-app copy
 *
 * A clipboard carrying `application/x-lexical-editor` already holds the
 * MATERIALIZED nodes, and Lexical's own paste path reconstructs them perfectly —
 * marks, links and all. Re-parsing that paste from `text/plain` would rebuild
 * the tokens correctly and lose everything around them: copying `**bold** att-…`
 * and pasting it back stripped the bold.
 *
 * ## Priority
 *
 * LOW: below the NORMAL-priority file/forest handlers (a pasted file is an
 * upload, a multi-line paste is structural) and above the EDITOR-priority
 * default insert, which keeps handling every paste with no token in it.
 */
export function TokenPastePlugin({
  extensions,
}: {
  extensions: readonly InlineTokenExtension[];
}) {
  const [editor] = useLexicalComposerContext();
  const extensionsRef = useLatestRef(extensions);

  useEffect(() => {
    return editor.registerCommand<ClipboardEvent>(
      PASTE_COMMAND,
      (event) => {
        const data = event.clipboardData;
        if (!data) return false;
        if (Array.from(data.types).includes(LEXICAL_MIME)) return false;
        const text = data.getData("text/plain");
        const exts = extensionsRef.current;
        if (!text || !hasToken(text, exts)) return false;
        event.preventDefault();
        // Command listeners already run inside an `editor.update()`.
        $insertTokenizedText(text, exts);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, extensionsRef]);

  return null;
}

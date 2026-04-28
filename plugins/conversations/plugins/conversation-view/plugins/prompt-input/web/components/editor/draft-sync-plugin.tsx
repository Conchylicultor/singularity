import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { PromptDraft } from "@plugins/conversations/plugins/conversation-view/web";
import { applyDraftToEditor, serializeEditorToDraft } from "./serialize";

// Two-way sync between the Lexical editor and an external PromptDraft store.
// - On editor changes: serialize and call onChange (debounced via microtask).
// - When `convId` changes: load the new conversation's draft into the editor.
//
// The internal/external write loop is broken by a `selfWriteRef` flag set
// while we're applying an external draft, so the change listener doesn't
// echo it back as a serialize.
export function DraftSyncPlugin({
  convId,
  initialDraft,
  onChange,
}: {
  convId: string;
  initialDraft: PromptDraft;
  onChange: (draft: PromptDraft) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const selfWriteRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Reset editor contents whenever the conversation switches. We deliberately
  // don't depend on `initialDraft` — only convId — so user typing into draft
  // doesn't ricochet through here. The initial mount also runs this once.
  useEffect(() => {
    selfWriteRef.current = true;
    applyDraftToEditor(editor, initialDraft);
    queueMicrotask(() => {
      selfWriteRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, convId]);

  useEffect(() => {
    return editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      if (selfWriteRef.current) return;
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      onChangeRef.current(serializeEditorToDraft(editor));
    });
  }, [editor]);

  return null;
}

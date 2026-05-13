import { useCallback, useEffect } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  useEditableField,
  type EditableField,
} from "@plugins/primitives/plugins/editable-field/web";
import { conversationNotesResource } from "@plugins/conversations/plugins/conversation-view/plugins/notes/shared";
import { upsertNote, deleteNote } from "./api";
import { useIsOpen, setIsOpen, toggleIsOpen } from "./notes-visibility-store";

export interface ConversationNoteState extends EditableField<string> {
  isVisible: boolean;
  noteExists: boolean;
  toggleVisible: () => void;
}

export function useConversationNote(
  conversationId: string,
): ConversationNoteState {
  const { data } = useResource(conversationNotesResource);
  const serverNote = data[conversationId]?.notes ?? "";
  const noteExists = serverNote.trim().length > 0;
  const isManuallyOpen = useIsOpen(conversationId);

  const handleSave = useCallback(
    async (next: string) => {
      if (next.trim() === "") {
        await deleteNote(conversationId);
      } else {
        await upsertNote(conversationId, next);
      }
    },
    [conversationId],
  );

  const field = useEditableField<string>({
    value: serverNote,
    onSave: handleSave,
    debounceMs: 1000,
  });

  useEffect(() => {
    if (!noteExists && field.value.trim() === "" && !field.isSaving) {
      setIsOpen(conversationId, false);
    }
  }, [conversationId, noteExists, field.value, field.isSaving]);

  const toggleVisible = useCallback(
    () => toggleIsOpen(conversationId),
    [conversationId],
  );

  return {
    ...field,
    isVisible: noteExists || isManuallyOpen,
    noteExists,
    toggleVisible,
  };
}

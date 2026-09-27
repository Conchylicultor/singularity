import { useCallback, useEffect } from "react";
import { useLiveRow } from "@plugins/network/plugins/live/web";
import {
  useEditableField,
  type EditableField,
} from "@plugins/primitives/plugins/editable-field/web";
import { conversationNoteRows } from "../../shared";
import { upsertNote, deleteNote } from "./api";
import { useIsOpen, setIsOpen, toggleIsOpen } from "./notes-visibility-store";

export interface ConversationNoteState extends EditableField<string> {
  isVisible: boolean;
  noteExists: boolean;
  pending: boolean;
  toggleVisible: () => void;
}

export function useConversationNote(
  conversationId: string,
): ConversationNoteState {
  const note = useLiveRow(conversationNoteRows, conversationId);
  // While pending, serverNote stays "" so useEditableField (which must run
  // unconditionally) has a valid initial value. Consumers gate on `pending`
  // to avoid showing a blank note before the row settles. On the settled arm
  // `found: false` means this conversation has no note.
  const serverNote = !note.pending && note.found ? note.row.notes : "";
  const noteExists = !note.pending && serverNote.trim().length > 0;
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
    pending: note.pending,
    toggleVisible,
  };
}

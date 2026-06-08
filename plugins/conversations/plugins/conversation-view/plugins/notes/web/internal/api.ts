import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  upsertNote as upsertNoteEndpoint,
  deleteNote as deleteNoteEndpoint,
} from "../../shared/endpoints";

export async function upsertNote(
  conversationId: string,
  notes: string,
): Promise<void> {
  await fetchEndpoint(upsertNoteEndpoint, { conversationId }, { body: { notes } });
}

export async function deleteNote(conversationId: string): Promise<void> {
  await fetchEndpoint(deleteNoteEndpoint, { conversationId });
}

import { writeDraft } from "@plugins/primitives/plugins/persistent-draft/web";

/**
 * The persistent-draft key of a conversation's unsent prompt, scoped by
 * conversation id. One definition: every surface that puts text back into the
 * prompt editor (a stopped turn, a rewind) has to name the same key the editor
 * reads, and a second literal is a key that silently stops matching.
 */
export const CONVERSATION_PROMPT_DRAFT_KEY = "conversation:prompt";

/** Put `text` in a conversation's prompt editor, replacing whatever is there. */
export function setConversationPromptDraft(
  conversationId: string,
  text: string,
): void {
  writeDraft(CONVERSATION_PROMPT_DRAFT_KEY, text, { scope: conversationId });
}

import { useCallback, useEffect, useRef } from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import type { Conversation as ConversationRecord } from "@plugins/tasks/plugins/tasks-core/core";
import {
  isDraftEmpty,
  usePromptInsert,
} from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation } from "@plugins/conversations/web";
import { sendPendingTurn } from "@plugins/conversations/plugins/conversation-view/plugins/pending-turn/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { PromptEditor } from "@plugins/primitives/plugins/prompt-editor/web";
import { toast } from "@plugins/shell/plugins/notifications/web";

export function PromptInput({ conversation }: { conversation: ConversationRecord }) {
  const live = useConversation(conversation.id) ?? conversation;
  const [draft, setDraft, clearDraft] = useDraft("conversation:prompt", "", {
    scope: conversation.id,
  });

  const disabled = live.status === "gone" || live.status === "done" || live.status === "starting" || !!live.waitingFor;

  const insertRef = useRef<((text: string) => void) | null>(null);
  const promptInsert = usePromptInsert();
  useEffect(() => {
    if (!promptInsert) return;
    return promptInsert.registerInsert((text) => insertRef.current?.(text));
  }, [promptInsert]);

  // Latest-draft ref so the send handler doesn't capture stale state.
  const draftRef = useLatestRef(draft);

  // The pending-turn store owns the whole send lifecycle (POST, retry,
  // transcript confirmation); the draft is cleared synchronously so a second
  // Enter is a no-op and the editor stays typable while the send is in flight.
  const send = useCallback(() => {
    const current = draftRef.current;
    if (isDraftEmpty(current) || disabled) return;
    clearDraft();
    sendPendingTurn(conversation.id, current);
  }, [conversation.id, disabled, clearDraft]);

  const placeholder = disabled
    ? live.waitingFor
      ? "Waiting for your answer in the terminal"
      : live.status === "done"
        ? "Conversation is done"
        : live.status === "gone"
          ? "Conversation is disconnected"
          : "Starting…"
    : live.status === "working"
      ? "Queue a message — Enter to queue, Shift+Enter for newline"
      : "Send a message — Enter to send, Shift+Enter for newline";

  return (
    <PromptEditor
      value={draft}
      onChange={setDraft}
      onSubmit={send}
      submitMode="enter"
      placeholder={placeholder}
      disabled={disabled}
      autoFocus
      minRows={1}
      maxHeight="10rem"
      namespace={`prompt-input-${conversation.id}`}
      onError={(msg) =>
        toast({
          type: "conversation",
          title: "Editor error",
          description: msg,
          variant: "error",
        })
      }
      insertRef={insertRef}
    />
  );
}

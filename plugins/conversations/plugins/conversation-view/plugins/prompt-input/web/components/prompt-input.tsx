import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ConversationRecord,
  isDraftEmpty,
  usePromptInsert,
} from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation } from "@plugins/conversations/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { PromptEditor } from "@plugins/primitives/plugins/prompt-editor/web";
import { toast } from "@plugins/notifications/web";

export function PromptInput({ conversation }: { conversation: ConversationRecord }) {
  const live = useConversation(conversation.id) ?? conversation;
  const [draft, setDraft, clearDraft] = useDraft("conversation:prompt", "", {
    scope: conversation.id,
  });
  const [sending, setSending] = useState(false);

  const disabled = live.status === "gone" || live.status === "done" || live.status === "starting" || !!live.waitingFor;

  const insertRef = useRef<((text: string) => void) | null>(null);
  const promptInsert = usePromptInsert();
  useEffect(() => {
    if (!promptInsert) return;
    return promptInsert.registerInsert((text) => insertRef.current?.(text));
  }, [promptInsert]);

  // Latest-draft ref so the send handler doesn't capture stale state.
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const send = useCallback(async () => {
    const current = draftRef.current;
    if (isDraftEmpty(current) || disabled || sending) return;
    setSending(true);
    try {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(conversation.id)}/turn`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: current }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      clearDraft();
    } catch (err) {
      toast({
        type: "conversation",
        description: `Failed to send: ${err instanceof Error ? err.message : String(err)}`,
        variant: "error",
      });
    } finally {
      setSending(false);
    }
  }, [conversation.id, disabled, sending, clearDraft]);

  const placeholder = disabled
    ? live.waitingFor
      ? "Waiting for your answer in the terminal"
      : live.status === "done"
        ? "Conversation is done"
        : live.status === "gone"
          ? "Conversation is disconnected"
          : "Starting…"
    : "Send a message — Enter to send, Shift+Enter for newline";

  return (
    <PromptEditor
      value={draft}
      onChange={setDraft}
      onSubmit={send}
      submitMode="enter"
      placeholder={placeholder}
      disabled={disabled || sending}
      autoFocus
      minRows={1}
      maxHeight="10rem"
      namespace={`prompt-input-${conversation.id}`}
      onError={(msg) =>
        toast({
          type: "conversation",
          description: `Editor error: ${msg}`,
          variant: "error",
        })
      }
      insertRef={insertRef}
    />
  );
}

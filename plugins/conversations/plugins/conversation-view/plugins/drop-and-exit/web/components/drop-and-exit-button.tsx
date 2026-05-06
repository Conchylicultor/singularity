import { useMemo, useRef, useState } from "react";
import { MdCheckCircle, MdDeleteForever, MdSend } from "react-icons/md";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { isDraftEmpty } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation, useConversationAction } from "@plugins/conversations/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { pushesResource } from "@plugins/tasks/shared";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { Button } from "@/components/ui/button";

export function DropAndExitButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const { data: pushes } = useResource(pushesResource);
  const [draft, , clearDraft] = useDraft("conversation:prompt", "", { scope: conversation.id });
  const [sending, setSending] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const hasPush = useMemo(
    () => (pushes ?? []).some((p) => p.attemptId === conversation.attemptId),
    [pushes, conversation.attemptId],
  );

  const { trigger, busy } = useConversationAction(conversation.id, "drop-and-exit", {
    successMessage: (data) => {
      const { dropped } = data as { dropped: boolean };
      return dropped ? "Task dropped and conversation closed" : "Task completed and conversation closed";
    },
    errorMessage: `${hasPush ? "Complete" : "Drop"} & Exit failed`,
  });

  const disabled = busy || live.status === "gone" || live.status === "starting";
  const hasDraft = !isDraftEmpty(draft);

  const send = async () => {
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
      Shell.Toast({
        description: `Failed to send: ${err instanceof Error ? err.message : String(err)}`,
        variant: "error",
      });
    } finally {
      setSending(false);
    }
  };

  if (hasDraft) {
    return (
      <Button
        variant="default"
        size="icon-sm"
        title={sending ? "Sending…" : "Send"}
        aria-label="Send"
        disabled={disabled || sending}
        onClick={send}
      >
        <MdSend className="size-3.5" />
      </Button>
    );
  }

  if (hasPush) {
    return (
      <Button
        variant="outline"
        size="icon-sm"
        title={busy ? "Completing…" : "Complete & Exit"}
        aria-label="Complete & Exit"
        disabled={disabled}
        onClick={trigger}
        className="border-emerald-300/70 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/40 dark:hover:text-emerald-300"
      >
        <MdCheckCircle className="size-3.5" />
      </Button>
    );
  }

  return (
    <Button
      variant="destructive"
      size="icon-sm"
      title={busy ? "Dropping…" : "Drop & Exit"}
      aria-label="Drop & Exit"
      disabled={disabled}
      onClick={trigger}
    >
      <MdDeleteForever className="size-3.5" />
    </Button>
  );
}

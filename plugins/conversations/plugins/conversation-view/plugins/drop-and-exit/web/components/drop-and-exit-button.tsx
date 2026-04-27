import { useMemo, useState } from "react";
import { MdCheckCircle, MdDeleteForever } from "react-icons/md";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation } from "@plugins/conversations/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { pushesResource } from "@plugins/tasks/shared";
import { Button } from "@/components/ui/button";

export function DropAndExitButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const [busy, setBusy] = useState(false);
  const { data: pushes } = useResource(pushesResource);

  const hasPush = useMemo(
    () => (pushes ?? []).some((p) => p.attemptId === conversation.attemptId),
    [pushes, conversation.attemptId],
  );

  const disabled =
    busy || live.status === "gone" || live.status === "starting";

  async function onClick() {
    if (disabled) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(conversation.id)}/drop-and-exit`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      Shell.Toast({
        description: data.dropped
          ? "Task dropped and conversation closed"
          : "Task completed and conversation closed",
        variant: "success",
      });
    } catch (err) {
      Shell.Toast({
        description: `${hasPush ? "Complete" : "Drop"} & Exit failed: ${err instanceof Error ? err.message : String(err)}`,
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  if (hasPush) {
    return (
      <Button
        variant="default"
        size="icon-sm"
        title={busy ? "Completing…" : "Complete & Exit"}
        aria-label="Complete & Exit"
        disabled={disabled}
        onClick={onClick}
        className="bg-green-600 text-white hover:bg-green-700"
      >
        <MdCheckCircle className="size-3.5" />
      </Button>
    );
  }

  return (
    <Button
      variant="default"
      size="icon-sm"
      title={busy ? "Dropping…" : "Drop & Exit"}
      aria-label="Drop & Exit"
      disabled={disabled}
      onClick={onClick}
      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
    >
      <MdDeleteForever className="size-3.5" />
    </Button>
  );
}

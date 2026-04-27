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
        variant="outline"
        size="icon-sm"
        title={busy ? "Completing…" : "Complete & Exit"}
        aria-label="Complete & Exit"
        disabled={disabled}
        onClick={onClick}
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
      onClick={onClick}
    >
      <MdDeleteForever className="size-3.5" />
    </Button>
  );
}

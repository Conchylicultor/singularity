import { useState } from "react";
import { MdReplay } from "react-icons/md";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation } from "@plugins/conversations/web";
import { toast } from "@plugins/notifications/web";
import { Button } from "@/components/ui/button";

export function ResumeButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const [busy, setBusy] = useState(false);

  const isNotRunning = live.status === "gone" || live.status === "done";
  const hasSession = !!live.claudeSessionId;
  const canResume = isNotRunning && hasSession;
  const disabled = busy || !canResume;

  const tooltip = !isNotRunning
    ? "Resume is available once the session has exited"
    : !hasSession
      ? "No saved Claude session to resume"
      : "Resume conversation (claude --resume)";

  async function onClick() {
    if (disabled) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(conversation.id)}/resume`,
        { method: "POST" },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      toast({ type: "conversation", title: "Resuming conversation", description: "Reconnecting the agent session…", variant: "success" });
    } catch (err) {
      toast({
        type: "conversation",
        title: "Resume failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="icon-sm"
      title={busy ? "Resuming…" : tooltip}
      aria-label="Resume"
      disabled={disabled}
      onClick={onClick}
    >
      <MdReplay className="size-3.5" />
    </Button>
  );
}

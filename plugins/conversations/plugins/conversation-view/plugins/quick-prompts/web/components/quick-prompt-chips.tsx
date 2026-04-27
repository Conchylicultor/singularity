import { useState } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation } from "@plugins/conversations/web";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { Button } from "@/components/ui/button";
import { quickPromptsResource } from "../../shared/resources";

export function QuickPromptChips({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const { data: prompts } = useResource(quickPromptsResource);
  const [sendingId, setSendingId] = useState<string | null>(null);

  if (!prompts || prompts.length === 0) return null;

  const disabled = live.status === "gone" || live.status === "starting";

  async function sendPrompt(id: string, text: string) {
    if (disabled || sendingId !== null) return;
    setSendingId(id);
    try {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(conversation.id)}/turn`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      Shell.Toast({
        description: `Failed to send prompt: ${err instanceof Error ? err.message : String(err)}`,
        variant: "error",
      });
    } finally {
      setSendingId(null);
    }
  }

  return (
    <>
      {prompts.map((p) => (
        <Button
          key={p.id}
          variant="outline"
          size="sm"
          disabled={disabled || sendingId !== null}
          className="h-7 rounded-full px-3 text-xs"
          onClick={() => void sendPrompt(p.id, p.prompt)}
        >
          {sendingId === p.id ? "Sending…" : p.title}
        </Button>
      ))}
    </>
  );
}

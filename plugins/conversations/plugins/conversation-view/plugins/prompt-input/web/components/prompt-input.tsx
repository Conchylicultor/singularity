import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  type ConversationRecord,
  usePromptDraft,
} from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation } from "@plugins/conversations/web";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { cn } from "@/lib/utils";

export function PromptInput({ conversation }: { conversation: ConversationRecord }) {
  const live = useConversation(conversation.id) ?? conversation;
  const { draft, setDraft, clearDraft } = usePromptDraft(conversation.id);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const disabled = live.status === "gone" || live.status === "starting";

  useEffect(() => {
    textareaRef.current?.focus();
  }, [conversation.id]);

  async function send() {
    const text = draft.trim();
    if (!text || disabled || sending) return;
    setSending(true);
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
      clearDraft();
    } catch (err) {
      Shell.Toast({
        description: `Failed to send: ${err instanceof Error ? err.message : String(err)}`,
        variant: "error",
      });
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
      disabled={disabled || sending}
      placeholder={
        disabled
          ? live.status === "gone"
            ? "Conversation is gone"
            : "Starting…"
          : "Send a message — Enter to send, Shift+Enter for newline"
      }
      style={{ fieldSizing: "content" } as CSSProperties}
      className={cn(
        "w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm leading-5 outline-none transition-colors",
        "max-h-40 overflow-y-auto",
        "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50",
        "dark:bg-input/30 dark:disabled:bg-input/80",
      )}
    />
  );
}

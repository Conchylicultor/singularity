import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { MdStop } from "react-icons/md";
import {
  type ConversationRecord,
  usePromptDraft,
} from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation } from "@plugins/conversations/web";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PromptInput({ conversation }: { conversation: ConversationRecord }) {
  const live = useConversation(conversation.id) ?? conversation;
  const { draft, setDraft, clearDraft } = usePromptDraft(conversation.id);
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const disabled = live.status === "gone" || live.status === "starting";
  const working = live.status === "working";

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

  async function stop() {
    if (!working || stopping) return;
    setStopping(true);
    try {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(conversation.id)}/stop`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      Shell.Toast({
        description: `Failed to stop: ${err instanceof Error ? err.message : String(err)}`,
        variant: "error",
      });
    } finally {
      setStopping(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex items-end gap-2">
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
          "flex-1 resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm leading-5 outline-none transition-colors",
          "max-h-40 overflow-y-auto",
          "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50",
          "dark:bg-input/30 dark:disabled:bg-input/80",
        )}
      />
      {working && (
        <Button
          variant="default"
          size="icon-sm"
          title={stopping ? "Stopping…" : "Stop"}
          aria-label="Stop"
          disabled={stopping}
          onClick={stop}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          <MdStop className="size-4" />
        </Button>
      )}
    </div>
  );
}

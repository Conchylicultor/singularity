import { useCallback, useRef, useState } from "react";
import { MdStop } from "react-icons/md";
import {
  type ConversationRecord,
  isDraftEmpty,
  usePromptDraft,
} from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation } from "@plugins/conversations/web";
import { PromptEditor } from "@plugins/primitives/plugins/paste-images/web";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { Button } from "@/components/ui/button";

export function PromptInput({ conversation }: { conversation: ConversationRecord }) {
  const live = useConversation(conversation.id) ?? conversation;
  const { draft, setDraft, clearDraft } = usePromptDraft(conversation.id);
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);

  const disabled = live.status === "gone" || live.status === "starting";
  const working = live.status === "working";

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
          body: JSON.stringify({ text: current.markdown }),
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
  }, [conversation.id, disabled, sending, clearDraft]);

  async function stop() {
    if (!working || stopping) return;
    setStopping(true);
    try {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(conversation.id)}/stop`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { ok: boolean; rewindText: string | null };
      if (data.rewindText) setDraft({ markdown: data.rewindText });
    } catch (err) {
      Shell.Toast({
        description: `Failed to stop: ${err instanceof Error ? err.message : String(err)}`,
        variant: "error",
      });
    } finally {
      setStopping(false);
    }
  }

  const placeholder = disabled
    ? live.status === "gone"
      ? "Conversation is gone"
      : "Starting…"
    : "Send a message — Enter to send, Shift+Enter for newline";

  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <PromptEditor
          value={draft.markdown}
          onChange={(markdown) => setDraft({ markdown })}
          onSubmit={send}
          submitMode="enter"
          placeholder={placeholder}
          disabled={disabled || sending}
          autoFocus
          minRows={1}
          maxHeight="10rem"
          namespace={`prompt-input-${conversation.id}`}
          onError={(msg) =>
            Shell.Toast({
              description: `Editor error: ${msg}`,
              variant: "error",
            })
          }
        />
      </div>
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

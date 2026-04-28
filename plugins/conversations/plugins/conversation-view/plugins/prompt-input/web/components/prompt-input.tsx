import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdStop } from "react-icons/md";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  type ConversationRecord,
  isDraftEmpty,
  type PromptDraft,
  usePromptDraft,
} from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation } from "@plugins/conversations/web";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildInitialConfig } from "./editor/lexical-config";
import { DraftSyncPlugin } from "./editor/draft-sync-plugin";
import { EnterKeyPlugin } from "./editor/enter-key-plugin";
import { ImagePastePlugin } from "./editor/image-paste-plugin";
import { clearEditor, draftToTurnFormData } from "./editor/serialize";

export function PromptInput({ conversation }: { conversation: ConversationRecord }) {
  const live = useConversation(conversation.id) ?? conversation;
  const { draft, setDraft, clearDraft } = usePromptDraft(conversation.id);
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);

  const disabled = live.status === "gone" || live.status === "starting";
  const working = live.status === "working";

  const initialConfig = useMemo(
    () =>
      buildInitialConfig({
        namespace: "prompt-input",
        onError: (err) => {
          Shell.Toast({
            description: `Editor error: ${err.message}`,
            variant: "error",
          });
        },
      }),
    [],
  );

  // Drafts are scoped per conversation; keep a stable reference into the latest
  // draft for the send handler so it doesn't capture stale state.
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const send = useCallback(async () => {
    const current = draftRef.current;
    const trimmedText = current.text.trim();
    if (
      isDraftEmpty(current) ||
      (trimmedText.length === 0 && current.images.length === 0) ||
      disabled ||
      sending
    ) {
      return;
    }
    setSending(true);
    try {
      const fd = await draftToTurnFormData(current);
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(conversation.id)}/turn`,
        { method: "POST", body: fd },
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
      const data = await res.json() as { ok: boolean; rewindText: string | null };
      if (data.rewindText) setDraft({ text: data.rewindText, images: [] });
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
      <LexicalComposer initialConfig={initialConfig}>
        <EditorShell
          disabled={disabled || sending}
          placeholder={placeholder}
        />
        <DraftSyncPlugin
          convId={conversation.id}
          initialDraft={draft}
          onChange={setDraft}
        />
        <ImagePastePlugin
          onError={(msg) =>
            Shell.Toast({
              description: `Failed to paste image: ${msg}`,
              variant: "error",
            })
          }
        />
        <EnterKeyPlugin onSend={send} />
        <HistoryPlugin />
        <SendOnPostMount draft={draft} />
      </LexicalComposer>
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

function EditorShell({
  disabled,
  placeholder,
}: {
  disabled: boolean;
  placeholder: string;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  // Mount focus.
  useEffect(() => {
    if (!disabled) editor.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex-1 min-w-0">
      <PlainTextPlugin
        contentEditable={
          <ContentEditable
            className={cn(
              "resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm leading-5 outline-none transition-colors",
              "max-h-40 min-h-[2rem] overflow-y-auto",
              "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              "aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:bg-input/50 aria-disabled:opacity-50",
              "dark:bg-input/30 dark:aria-disabled:bg-input/80",
            )}
            aria-disabled={disabled}
            aria-placeholder={placeholder}
            placeholder={
              <div className="pointer-events-none absolute inset-0 px-2.5 py-1.5 text-sm leading-5 text-muted-foreground">
                {placeholder}
              </div>
            }
          />
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
    </div>
  );
}

// Defensive: when a draft was just cleared (after send), make sure the editor
// reflects empty state immediately rather than waiting for the convId-keyed
// reset (which doesn't fire here since convId hasn't changed).
function SendOnPostMount({ draft }: { draft: PromptDraft }) {
  const [editor] = useLexicalComposerContext();
  const wasNonEmpty = useRef(false);
  useEffect(() => {
    const empty = isDraftEmpty(draft);
    if (empty && wasNonEmpty.current) {
      clearEditor(editor);
    }
    wasNonEmpty.current = !empty;
  }, [editor, draft]);
  return null;
}

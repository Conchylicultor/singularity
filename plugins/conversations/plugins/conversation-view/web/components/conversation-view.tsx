import { useCallback, useEffect, useState } from "react";
import { subscribeWsStatus } from "@core";
import { Conversation } from "../slots";
import { terminalPane } from "@plugins/terminal/web/views";
import type { Conversation as ConversationRecord } from "@plugins/conversations/shared/types";
import { useConversationStream } from "@plugins/conversations/web/stream";
import { Button } from "@/components/ui/button";

const TMUX = "/opt/homebrew/bin/tmux";

export function ConversationView({ sessionId }: { sessionId: string }) {
  const toolbarItems = Conversation.Toolbar.useContributions();
  const [conversation, setConversation] = useState<ConversationRecord | null>(null);

  const fetchTitle = useCallback(() => {
    let cancelled = false;
    setConversation(null);
    fetch(`/api/conversations/${sessionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((row: ConversationRecord | null) => {
        if (!cancelled && row) setConversation(row);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => fetchTitle(), [fetchTitle]);

  useConversationStream(useCallback((parsed) => {
    if (parsed.type === "title" && parsed.id === sessionId) {
      setConversation((prev) => (prev ? { ...prev, title: parsed.title } : prev));
    } else if (parsed.type === "created" && parsed.conversation.id === sessionId) {
      setConversation(parsed.conversation);
    }
  }, [sessionId]));

  useEffect(() => {
    let wasReconnecting = false;
    return subscribeWsStatus(({ url, status }) => {
      if (url !== "/api/conversations/stream") return;
      if (status === "reconnecting") wasReconnecting = true;
      else if (status === "open" && wasReconnecting) {
        wasReconnecting = false;
        fetchTitle();
      }
    });
  }, [fetchTitle]);

  const { component: TerminalComponent } = terminalPane({
    command: [TMUX, "-u", "attach", "-t", sessionId],
    title: sessionId,
  });

  return (
    <div className="flex h-full flex-col p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-1 truncate font-medium text-sm">
          {conversation?.title ?? sessionId}
        </div>
        <div className="flex items-center gap-1">
          {conversation &&
            toolbarItems.map((item, idx) => {
              if (item.component) {
                const Component = item.component;
                return (
                  <Component
                    key={item.label ?? `toolbar-${idx}`}
                    conversation={conversation}
                  />
                );
              }
              const Icon = item.icon;
              return (
                <Button
                  key={item.label ?? `toolbar-${idx}`}
                  variant="ghost"
                  size="sm"
                  onClick={() => item.onClick?.(conversation)}
                >
                  {Icon ? <Icon className="size-4" /> : null}
                  {item.label}
                </Button>
              );
            })}
        </div>
      </div>
      <div className="flex-1 overflow-hidden rounded-md border bg-muted/30">
        <TerminalComponent />
      </div>
    </div>
  );
}

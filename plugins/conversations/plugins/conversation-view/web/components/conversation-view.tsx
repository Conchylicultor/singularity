import { useEffect, useState } from "react";
import { Conversation } from "../slots";
import type { ConversationState } from "../slots";
import { terminalPane } from "@plugins/terminal/web/views";
import type { ConversationEvent } from "@plugins/conversations/shared/protocol";
import { Button } from "@/components/ui/button";

const TMUX = "/opt/homebrew/bin/tmux";

export function ConversationView({ sessionId }: { sessionId: string }) {
  const toolbarItems = Conversation.Toolbar.useContributions();
  const conversation: ConversationState = { id: sessionId };
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/conversations/${sessionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((row) => {
        if (!cancelled && row) setTitle(row.title ?? null);
      })
      .catch(() => {});
    const es = new EventSource("/api/conversations/stream");
    es.onmessage = (ev) => {
      let parsed: ConversationEvent;
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (parsed.type === "title" && parsed.id === sessionId) {
        setTitle(parsed.title);
      } else if (parsed.type === "created" && parsed.conversation.id === sessionId) {
        setTitle(parsed.conversation.title ?? null);
      }
    };
    return () => {
      cancelled = true;
      es.close();
    };
  }, [sessionId]);

  const { component: TerminalComponent } = terminalPane({
    command: [TMUX, "-u", "attach", "-t", sessionId],
    title: sessionId,
  });

  return (
    <div className="flex h-full flex-col p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-1 truncate font-medium text-sm">{title ?? sessionId}</div>
        <div className="flex items-center gap-1">
          {toolbarItems.map((item, idx) => {
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

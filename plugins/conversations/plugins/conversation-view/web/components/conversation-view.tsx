import { useCallback, useEffect, useMemo, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { subscribeWsStatus } from "@core";
import { Conversation } from "../slots";
import {
  Conversation as ConversationCommands,
  MiddlePaneContext,
  RightPaneContext,
  type MiddlePaneDescriptor,
  type RightPaneDescriptor,
} from "../commands";
import { terminalPane } from "@plugins/terminal/web/views";
import type { Conversation as ConversationRecord } from "@plugins/conversations/shared/types";
import { useConversationStream } from "@plugins/conversations/web/stream";
import { Button } from "@/components/ui/button";

const TMUX = "/opt/homebrew/bin/tmux";

export function ConversationView({ sessionId }: { sessionId: string }) {
  const toolbarItems = Conversation.Toolbar.useContributions();
  const [conversation, setConversation] = useState<ConversationRecord | null>(null);
  const [middlePane, setMiddlePane] = useState<MiddlePaneDescriptor | null>(null);
  const [rightPane, setRightPane] = useState<RightPaneDescriptor | null>(null);
  ConversationCommands.OpenMiddlePane.useHandler((d) => setMiddlePane(d));
  ConversationCommands.OpenRightPane.useHandler((d) => setRightPane(d));
  useEffect(() => {
    setMiddlePane(null);
    setRightPane(null);
  }, [sessionId]);

  const fetchConversation = useCallback(() => {
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

  useEffect(() => fetchConversation(), [fetchConversation]);

  useConversationStream(useCallback((parsed) => {
    if (parsed.type === "title" && parsed.id === sessionId) {
      setConversation((prev) => (prev ? { ...prev, title: parsed.title } : prev));
    } else if (parsed.type === "status" && parsed.id === sessionId) {
      setConversation((prev) => (prev ? { ...prev, status: parsed.status } : prev));
    }
  }, [sessionId]));

  useEffect(() => {
    let wasReconnecting = false;
    return subscribeWsStatus(({ url, status }) => {
      if (url !== "/api/conversations/stream") return;
      if (status === "reconnecting") wasReconnecting = true;
      else if (status === "open" && wasReconnecting) {
        wasReconnecting = false;
        fetchConversation();
      }
    });
  }, [fetchConversation]);

  const TerminalComponent = useMemo(
    () =>
      terminalPane({
        command: [TMUX, "-u", "attach", "-t", sessionId],
        title: sessionId,
      }).component,
    [sessionId],
  );

  const MiddlePaneComponent = middlePane?.component;
  const RightPaneComponent = rightPane?.component;

  return (
    <MiddlePaneContext.Provider value={middlePane}>
    <RightPaneContext.Provider value={rightPane}>
    <div className="flex h-[calc(100svh-3rem)] min-h-0 flex-col overflow-hidden p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="truncate font-medium text-sm">
            {conversation?.title ?? sessionId}
          </div>
          {conversation &&
            toolbarItems
              .filter((item) => item.group === "status")
              .map((item, idx) => {
                if (!item.component) return null;
                const Component = item.component;
                return (
                  <Component
                    key={item.label ?? `status-${idx}`}
                    conversation={conversation}
                  />
                );
              })}
        </div>
        <div className="flex items-center gap-1">
          {conversation &&
            toolbarItems
              .filter((item) => item.group !== "status")
              .map((item, idx) => {
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
                    size="icon"
                    title={item.label}
                    aria-label={item.label}
                    onClick={() => item.onClick?.(conversation)}
                  >
                    {Icon ? <Icon className="size-4" /> : null}
                  </Button>
                );
              })}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Group orientation="horizontal" className="flex h-full min-h-0">
          <Panel minSize="20%" className="flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden">
            {MiddlePaneComponent && conversation && (
              <div className="max-h-[50%] shrink-0 overflow-y-auto rounded-md border bg-muted/30">
                <MiddlePaneComponent conversation={conversation} />
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-muted/30">
              <TerminalComponent />
            </div>
          </Panel>
          {RightPaneComponent && conversation && (
            <>
              <Separator className="mx-2 w-px bg-border transition-colors data-[separator-state=hover]:bg-foreground/20 data-[separator-state=drag]:bg-foreground/30" />
              <Panel minSize="25%" className="min-h-0 min-w-0 overflow-hidden">
                <div className="h-full min-h-0 overflow-hidden rounded-md border bg-muted/30">
                  <RightPaneComponent conversation={conversation} />
                </div>
              </Panel>
            </>
          )}
        </Group>
      </div>
    </div>
    </RightPaneContext.Provider>
    </MiddlePaneContext.Provider>
  );
}

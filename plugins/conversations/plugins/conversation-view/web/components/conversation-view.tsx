import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Conversation, type ConversationRecord } from "../slots";
import {
  Conversation as ConversationCommands,
  MainViewContext,
  MiddlePaneContext,
  RightPaneContext,
  type MainViewDescriptor,
  type MiddlePaneDescriptor,
  type RightPaneDescriptor,
} from "../commands";
import { terminalPane } from "@plugins/terminal/web";
import { useConversation, useConversationById } from "@plugins/conversations/web";
import { Button } from "@/components/ui/button";

const TMUX = "/opt/homebrew/bin/tmux";

type PromptBarItem = ReturnType<typeof Conversation.PromptBar.useContributions>[number];

function PromptBar({
  items,
  conversation,
}: {
  items: PromptBarItem[];
  conversation: ConversationRecord;
}) {
  const sections = items.reduce<Map<string, { order: number; items: PromptBarItem[] }>>(
    (acc, item) => {
      const entry = acc.get(item.section) ?? { order: item.sectionOrder ?? 0, items: [] };
      entry.items.push(item);
      acc.set(item.section, entry);
      return acc;
    },
    new Map(),
  );
  const sorted = [...sections.entries()].sort(([, a], [, b]) => a.order - b.order);

  return (
    <div className="flex shrink-0 items-end justify-end gap-3 border-t border-border px-3 pt-1.5 pb-2">
      {sorted.map(([section, { items: sectionItems }], idx) => (
        <div key={section} className="flex items-center gap-3">
          {idx > 0 && <div className="h-4 w-px bg-border" />}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] leading-none text-muted-foreground/60">{section}</span>
            <div className="flex items-center gap-1.5">
              {sectionItems.map((item, i) => {
                const Component = item.component;
                return <Component key={i} conversation={conversation} />;
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConversationView({ sessionId }: { sessionId: string }) {
  const toolbarItems = Conversation.Toolbar.useContributions();
  const titleItems = Conversation.Title.useContributions();
  const promptBarItems = Conversation.PromptBar.useContributions();
  // useConversation subscribes to the live WebSocket resource (recentConversationsResource),
  // so status updates (starting → working → done) are reflected in real time.
  // Fall back to the point-lookup only for older conversations outside the recent window.
  const liveConversation = useConversation(sessionId);
  const fetchedConversation = useConversationById(liveConversation ? null : sessionId);
  const conversation = liveConversation ?? fetchedConversation;
  const [middlePane, setMiddlePane] = useState<MiddlePaneDescriptor | null>(null);
  const [rightPane, setRightPane] = useState<RightPaneDescriptor | null>(null);
  const [mainView, setMainView] = useState<MainViewDescriptor | null>(null);
  ConversationCommands.OpenMiddlePane.useHandler((d) => setMiddlePane(d));
  ConversationCommands.OpenRightPane.useHandler((d) => setRightPane(d));
  ConversationCommands.OpenMainView.useHandler((d) => setMainView(d));
  useEffect(() => {
    setMiddlePane(null);
    setRightPane(null);
    setMainView(null);
  }, [sessionId]);

  const TerminalComponent = useMemo(
    () =>
      terminalPane({
        command: [TMUX, "-u", "attach", "-t", sessionId],
        title: sessionId,
      }).component,
    [sessionId],
  );

  // The terminal mounts `tmux attach` once. After Resume re-spawns the pane,
  // the existing PTY (which exited when the original session died) has to be
  // replaced — bump a key whenever the conversation transitions from gone to
  // live so the TerminalComponent remounts and reattaches.
  const liveStatus = conversation?.status;
  const [reattachKey, setReattachKey] = useState(0);
  const wasGoneRef = useRef(liveStatus === "gone");
  useEffect(() => {
    if (wasGoneRef.current && liveStatus && liveStatus !== "gone") {
      setReattachKey((k) => k + 1);
    }
    wasGoneRef.current = liveStatus === "gone";
  }, [liveStatus]);

  const MiddlePaneComponent = middlePane?.component;
  const RightPaneComponent = rightPane?.component;
  const MainViewComponent = mainView?.component;
  const TitleComponent = titleItems[0]?.component ?? null;

  return (
    <MainViewContext.Provider value={mainView}>
    <MiddlePaneContext.Provider value={middlePane}>
    <RightPaneContext.Provider value={rightPane}>
    <div className="flex h-[calc(100svh-3rem)] min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {conversation && TitleComponent ? (
            <TitleComponent conversation={conversation} />
          ) : (
            <div className="truncate font-medium text-sm">
              {conversation?.title ?? sessionId}
            </div>
          )}
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
        {MainViewComponent && conversation ? (
          <div className="h-full min-h-0 overflow-hidden">
            <MainViewComponent conversation={conversation} />
          </div>
        ) : (
          <Group orientation="horizontal" className="flex h-full min-h-0">
            <Panel minSize="20%" className="flex min-h-0 min-w-0 flex-col overflow-hidden">
              {MiddlePaneComponent && conversation && (
                <div className="max-h-[50%] shrink-0 overflow-y-auto">
                  <MiddlePaneComponent conversation={conversation} />
                </div>
              )}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="min-h-0 flex-1 overflow-hidden">
                  <TerminalComponent key={reattachKey} />
                </div>
                {conversation && promptBarItems.length > 0 && (
                  <PromptBar items={promptBarItems} conversation={conversation} />
                )}
              </div>
            </Panel>
            {RightPaneComponent && conversation && (
              <>
                <Separator className="w-px bg-border transition-colors data-[separator-state=hover]:bg-foreground/20 data-[separator-state=drag]:bg-foreground/30" />
                <Panel minSize="25%" className="min-h-0 min-w-0 overflow-hidden">
                  <div className="h-full min-h-0 overflow-hidden">
                    <RightPaneComponent conversation={conversation} />
                  </div>
                </Panel>
              </>
            )}
          </Group>
        )}
      </div>
    </div>
    </RightPaneContext.Provider>
    </MiddlePaneContext.Provider>
    </MainViewContext.Provider>
  );
}

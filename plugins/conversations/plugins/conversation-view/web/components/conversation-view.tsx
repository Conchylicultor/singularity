import { useEffect, useMemo, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Conversation } from "../slots";
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
import { useConversationById } from "@plugins/conversations/web";
import { Button } from "@/components/ui/button";

const TMUX = "/opt/homebrew/bin/tmux";

export function ConversationView({ sessionId }: { sessionId: string }) {
  const toolbarItems = Conversation.Toolbar.useContributions();
  const titleItems = Conversation.Title.useContributions();
  const conversation = useConversationById(sessionId);
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
              .filter((item) => item.group !== "status" && item.group !== "floating")
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
                  <TerminalComponent />
                </div>
                {conversation && toolbarItems.some((item) => item.group === "floating") && (
                  <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-3 py-2">
                    {toolbarItems
                      .filter((item) => item.group === "floating")
                      .map((item, idx) => {
                        if (!item.component) return null;
                        const Component = item.component;
                        return <Component key={item.label ?? `floating-${idx}`} conversation={conversation} />;
                      })}
                  </div>
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

import { Conversation } from "../slots";
import type { ConversationState } from "../slots";
import { terminalPane } from "@plugins/terminal/web/views";
import { Button } from "@/components/ui/button";

const TMUX = "/opt/homebrew/bin/tmux";

export function ConversationView({ sessionId }: { sessionId: string }) {
  const toolbarItems = Conversation.Toolbar.useContributions();
  const conversation: ConversationState = { id: sessionId };

  const { component: TerminalComponent } = terminalPane({
    command: [TMUX, "-u", "attach", "-t", sessionId],
    title: sessionId,
  });

  return (
    <div className="flex h-full flex-col p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-1 truncate font-medium text-sm">{sessionId}</div>
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

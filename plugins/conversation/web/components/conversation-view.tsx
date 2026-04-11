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
    <div className="flex h-full flex-col">
      {toolbarItems.length > 0 && (
        <div className="flex items-center gap-1 border-b px-4 h-10">
          {toolbarItems.map((item) => (
            <Button
              key={item.label}
              variant="ghost"
              size="sm"
              onClick={() => item.onClick(conversation)}
            >
              <item.icon className="size-4" />
              {item.label}
            </Button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <TerminalComponent />
      </div>
    </div>
  );
}

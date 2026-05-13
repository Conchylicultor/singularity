import type { ReactNode } from "react";
import { Pane, type } from "@plugins/primitives/plugins/pane/web";
import { useConversation, useConversationById } from "@plugins/conversations/web";
import type { ConversationRecord } from "./slots";
import { ConversationView } from "./components/conversation-view";
import { ActiveRelateSync } from "./components/active-relate-sync";

export const conversationPane = Pane.define({
  id: "conversation",
  segment: "c/:convId",
  component: ConversationView,
  provides: type<{ conversation: ConversationRecord }>(),
  provide: ConversationPaneProvide,
  width: 600,
});

/**
 * Loads the conversation record by `convId` and wraps children in
 * `<conversationPane.Provider>`. Reused by any host (the conversation column,
 * agent/task columns hosting an embedded conversation) that needs sibling panes
 * to access the conversation via `conversationPane.useData()`.
 */
export function ConversationProvide({
  convId,
  children,
}: {
  convId: string;
  children: ReactNode;
}) {
  // useConversation subscribes to the live WebSocket resource (recentConversationsResource),
  // so status updates are reflected in real time. Fall back to the point-lookup only for
  // older conversations outside the recent window.
  const live = useConversation(convId);
  const fetched = useConversationById(live ? null : convId);
  const conversation = live ?? fetched;

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Loading conversation…
      </div>
    );
  }

  return (
    <conversationPane.Provider value={{ conversation }}>
      {children}
    </conversationPane.Provider>
  );
}

function ConversationPaneProvide({ children }: { children: ReactNode }) {
  const { convId } = conversationPane.useParams();
  return (
    <ConversationProvide convId={convId}>
      <ActiveRelateSync />
      {children}
    </ConversationProvide>
  );
}

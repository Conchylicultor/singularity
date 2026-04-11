import type { PaneDescriptor } from "@plugins/shell/web/commands";
import { ConversationView } from "./components/conversation-view";

export function conversationPane(opts: { session_id: string }): PaneDescriptor {
  const Component = () => <ConversationView sessionId={opts.session_id} />;
  return {
    title: opts.session_id,
    component: Component,
  };
}

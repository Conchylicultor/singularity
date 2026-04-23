import { Pane, type, type PaneObject } from "@plugins/pane/web";
import type { ConversationRecord } from "./slots";
import { ConversationView } from "./components/conversation-view";

// Panes that take over the whole conversation main area (no terminal, no
// split). Side panes — docs, tasks, jsonl — don't register here; they render
// alongside the terminal via a resizable split. `review` is currently the
// only main pane.
const mainPaneIds = new Set<string>();

export function markMainPane(pane: PaneObject<any, any, any>): void {
  mainPaneIds.add(pane.id);
}

export function isMainPaneId(paneId: string): boolean {
  return mainPaneIds.has(paneId);
}

export const conversationPane = Pane.define({
  id: "conversation",
  path: "/c/:convId",
  component: ConversationPaneBody,
  provides: type<{ conversation: ConversationRecord }>(),
});

function ConversationPaneBody() {
  const { convId } = conversationPane.useParams();
  return <ConversationView sessionId={convId} />;
}

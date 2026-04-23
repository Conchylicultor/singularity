import type { RightPaneDescriptor } from "@plugins/conversations/plugins/conversation-view/web";
import { JsonlPane } from "./components/jsonl-pane";

export const JSONL_PANE_ID = "conversation.jsonl-viewer";

export function jsonlRightPane(): RightPaneDescriptor {
  return { id: JSONL_PANE_ID, component: JsonlPane };
}

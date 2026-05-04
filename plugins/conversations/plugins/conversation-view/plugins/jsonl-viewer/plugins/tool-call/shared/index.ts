import type { JsonlEvent } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/shared";

export type ToolCallEvent = Extract<JsonlEvent, { kind: "tool-call" }>;

export interface ToolRendererProps {
  event: ToolCallEvent;
}

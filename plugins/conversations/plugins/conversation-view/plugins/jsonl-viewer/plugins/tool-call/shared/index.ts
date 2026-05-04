import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/shared";

export type ToolCallEvent = Extract<JsonlEvent, { kind: "tool-call" }>;

export interface ToolRendererProps {
  event: ToolCallEvent;
}

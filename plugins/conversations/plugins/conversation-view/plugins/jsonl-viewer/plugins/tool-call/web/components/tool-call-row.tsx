import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { JsonlViewerTool } from "../slots";
import type { ToolCallEvent } from "../../core";

export function ToolCallRow({ event }: { event: JsonlEvent }) {
  const e = event as ToolCallEvent;
  return <JsonlViewerTool.Renderer.Dispatch event={e} />;
}

import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/shared";
import { JsonlViewerTool } from "../slots";
import type { ToolCallEvent } from "../../shared";
import { GenericToolView } from "./generic-tool-view";

function resolveRenderer(
  event: ToolCallEvent,
  contributions: ReturnType<typeof JsonlViewerTool.Renderer.useContributions>,
) {
  const exact = contributions.find(
    (c) => c.name != null && c.name === event.name,
  );
  if (exact) return exact.component;

  const pattern = contributions.find(
    (c) => c.pattern != null && c.pattern.test(event.name),
  );
  if (pattern) return pattern.component;

  return GenericToolView;
}

export function ToolCallRow({ event }: { event: JsonlEvent }) {
  const e = event as ToolCallEvent;
  const contributions = JsonlViewerTool.Renderer.useContributions();
  const Renderer = resolveRenderer(e, contributions);
  return <Renderer event={e} />;
}

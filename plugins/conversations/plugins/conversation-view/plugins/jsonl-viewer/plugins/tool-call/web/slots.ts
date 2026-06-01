import {
  defineDispatchSlot,
  type DispatchContribution,
} from "@plugins/primitives/plugins/slot-render/web";
import type { ToolRendererProps } from "../core";
import { GenericToolView } from "./components/generic-tool-view";

export type ToolRendererContribution = DispatchContribution<ToolRendererProps, string>;

export const JsonlViewerTool = {
  Renderer: defineDispatchSlot<ToolRendererProps, string>(
    "conversation.jsonl-viewer.tool-renderer",
    {
      key: (p) => p.event.name,
      fallback: GenericToolView,
      docLabel: (c) =>
        typeof c.match === "string" ? c.match : c.match.source,
    },
  ),
};

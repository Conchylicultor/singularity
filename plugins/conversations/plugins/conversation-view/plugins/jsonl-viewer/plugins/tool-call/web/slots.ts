import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType } from "react";
import type { ToolRendererProps } from "../core";

export interface ToolRendererContribution {
  name?: string;
  pattern?: RegExp;
  component: ComponentType<ToolRendererProps>;
}

export const JsonlViewerTool = {
  Renderer: defineSlot<ToolRendererContribution>(
    "conversation.jsonl-viewer.tool-renderer",
    { docLabel: (p) => p.name ?? p.pattern?.source },
  ),
};

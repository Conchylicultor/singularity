import { defineSlot } from "@core";
import type { ComponentType } from "react";
import type { ToolRendererProps } from "../shared";

export interface ToolRendererContribution {
  name?: string;
  pattern?: RegExp;
  component: ComponentType<ToolRendererProps>;
  summary?: ComponentType<ToolRendererProps>;
  defaultOpen?: boolean;
}

export const JsonlViewerTool = {
  Renderer: defineSlot<ToolRendererContribution>(
    "conversation.jsonl-viewer.tool-renderer",
  ),
};

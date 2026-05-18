import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { PluginChangeDiff, PluginReviewProps } from "../core";

export const PluginChanges = {
  Section: defineRenderSlot<{
    label: string;
    component: ComponentType<PluginReviewProps>;
    summary?: ComponentType<PluginReviewProps>;
    hasContent?: (plugin: PluginChangeDiff) => boolean;
  }>("review.plugin-changes.section"),
};

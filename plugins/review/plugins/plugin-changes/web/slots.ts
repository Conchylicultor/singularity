import type { ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type {
  DiffRenderer,
  PluginChangeDiff,
  PluginReviewProps,
} from "../core";

export const PluginChanges = {
  Section: defineRenderSlot<{
    label: string;
    component: ComponentType<PluginReviewProps>;
    summary?: ComponentType<PluginReviewProps>;
    hasContent?: (plugin: PluginChangeDiff) => boolean;
  }>("review.plugin-changes.section"),

  DiffRenderer: defineSlot<DiffRenderer>(
    "review.plugin-changes.diff-renderer",
    { docLabel: (p) => p.label },
  ),
};

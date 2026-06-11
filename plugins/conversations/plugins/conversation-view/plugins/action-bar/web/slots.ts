import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export const Conversation = {
  // Size-owning: every action inherits `sm` density, so contributions omit `size`
  // and all controls (icon or text or chip) snap to one height.
  ActionBar: defineRenderSlot<{ component: ComponentType }>(
    "conversation.action-bar",
    { controlSize: "sm" },
  ),
};

import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export const Conversation = {
  ActionBar: defineRenderSlot<{ component: ComponentType }>(
    "conversation.action-bar",
  ),
};

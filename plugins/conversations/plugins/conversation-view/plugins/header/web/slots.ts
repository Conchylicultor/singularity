import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export const Conversation = {
  Header: defineRenderSlot<{ component: ComponentType }>(
    "conversation.header",
  ),
};

import { defineSlot } from "@core";
import type { ComponentType } from "react";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";

export const Code = {
  ToolbarButton: defineSlot<{
    component: ComponentType<{ conversation: ConversationRecord }>;
  }>("conversation.code.toolbar-button"),
};

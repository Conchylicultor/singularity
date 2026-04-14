import { defineSlot } from "@core";
import type { ComponentType } from "react";
import type { ConversationState } from "@plugins/conversations/plugins/conversation-view/web/slots";

export const Code = {
  ToolbarButton: defineSlot<{
    component: ComponentType<{ conversation: ConversationState }>;
  }>("conversation.code.toolbar-button"),
};

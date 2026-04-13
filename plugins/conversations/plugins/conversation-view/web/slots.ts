import { defineSlot } from "@core";
import type { ComponentType } from "react";

export interface ConversationState {
  id: string;
}

export const Conversation = {
  Toolbar: defineSlot<{
    label: string;
    icon: ComponentType<{ className?: string }>;
    onClick: (conversation: ConversationState) => void;
  }>("conversation.toolbar"),
};

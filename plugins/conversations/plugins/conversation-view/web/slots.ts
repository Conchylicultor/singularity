import { defineSlot } from "@core";
import type { ComponentType } from "react";
import type { Conversation as ConversationRecord } from "@plugins/conversations/shared";

export type ConversationState = ConversationRecord;

export const Conversation = {
  Toolbar: defineSlot<{
    label?: string;
    icon?: ComponentType<{ className?: string }>;
    onClick?: (conversation: ConversationState) => void;
    component?: ComponentType<{ conversation: ConversationState }>;
    group?: string;
  }>("conversation.toolbar"),
  Title: defineSlot<{
    component: ComponentType<{ conversation: ConversationState }>;
  }>("conversation.title"),
};

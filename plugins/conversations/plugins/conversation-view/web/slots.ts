import { defineSlot } from "@core";
import type { ComponentType } from "react";
import type { Conversation as ConversationRecord } from "@plugins/conversations/shared";

export type { Conversation as ConversationRecord } from "@plugins/conversations/shared";

export const Conversation = {
  Toolbar: defineSlot<{
    label?: string;
    icon?: ComponentType<{ className?: string }>;
    onClick?: (conversation: ConversationRecord) => void;
    component?: ComponentType<{ conversation: ConversationRecord }>;
    group?: string;
  }>("conversation.toolbar"),
  Title: defineSlot<{
    component: ComponentType<{ conversation: ConversationRecord }>;
  }>("conversation.title"),
  PromptBar: defineSlot<{
    section: string;
    sectionOrder?: number;
    component: ComponentType<{ conversation: ConversationRecord }>;
  }>("conversation.prompt-bar"),
  PromptInput: defineSlot<{
    component: ComponentType<{ conversation: ConversationRecord }>;
  }>("conversation.prompt-input"),
};

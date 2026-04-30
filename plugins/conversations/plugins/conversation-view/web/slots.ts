import { defineSlot } from "@core";
import type { ComponentType } from "react";
import type { Conversation as ConversationRecord } from "@plugins/conversations/shared";

export type { Conversation as ConversationRecord } from "@plugins/conversations/shared";

export const Conversation = {
  PromptBar: defineSlot<{
    section: string;
    sectionOrder?: number;
    component: ComponentType<{ conversation: ConversationRecord }>;
  }>("conversation.prompt-bar"),
  PromptInput: defineSlot<{
    component: ComponentType<{ conversation: ConversationRecord }>;
  }>("conversation.prompt-input"),
  AbovePromptInput: defineSlot<{
    component: ComponentType<{ conversation: ConversationRecord }>;
  }>("conversation.above-prompt-input"),
};

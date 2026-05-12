import { defineSlot } from "@core";
import type { ComponentType } from "react";
import type { Conversation as ConversationRecord } from "@plugins/tasks-core/core";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export type { Conversation as ConversationRecord } from "@plugins/tasks-core/core";

export const Conversation = {
  PromptBar: defineRenderSlot<{
    section: string;
    sectionOrder?: number;
    component: ComponentType<{ conversation: ConversationRecord }>;
  }>("conversation.prompt-bar", {
    docLabel: (p) => p.section,
  }),
  PromptInput: defineSlot<{
    component: ComponentType<{ conversation: ConversationRecord }>;
  }>("conversation.prompt-input"),
  AbovePromptInput: defineRenderSlot<{
    component: ComponentType<{ conversation: ConversationRecord }>;
  }>("conversation.above-prompt-input"),
  TitlePrefix: defineSlot<{
    component: ComponentType<{ conversation: ConversationRecord }>;
  }>("conversation.title-prefix"),
};

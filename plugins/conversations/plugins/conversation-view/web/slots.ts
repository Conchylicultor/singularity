import type { ComponentType } from "react";
import type { Conversation as ConversationRecord } from "@plugins/tasks/plugins/tasks-core/core";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export const Conversation = {
  PromptBar: defineRenderSlot<{
    section: string;
    sectionOrder?: number;
    component: ComponentType<{ conversation: ConversationRecord }>;
  }>({
    docLabel: (p) => p.section,
  }),
  PromptInput: defineRenderSlot<{
    component: ComponentType<{ conversation: ConversationRecord }>;
  }>(),
  AbovePromptInput: defineRenderSlot<{
    component: ComponentType<{ conversation: ConversationRecord }>;
  }>(),
};

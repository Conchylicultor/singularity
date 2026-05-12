import { defineSlot } from "@core";
import type { ComponentType } from "react";
import type { Conversation as ConversationRecord } from "@plugins/tasks-core/core";
import { Reorder } from "@plugins/reorder/web";

export type { Conversation as ConversationRecord } from "@plugins/tasks-core/core";

export const Conversation = {
  PromptBar: Reorder.area(
    defineSlot<{
      section: string;
      sectionOrder?: number;
      component: ComponentType<{ conversation: ConversationRecord }>;
    }>("conversation.prompt-bar", { docLabel: (p) => p.section }),
    { getGroup: (item) => item.section },
  ),
  PromptInput: defineSlot<{
    component: ComponentType<{ conversation: ConversationRecord }>;
  }>("conversation.prompt-input"),
  AbovePromptInput: Reorder.area(
    defineSlot<{
      component: ComponentType<{ conversation: ConversationRecord }>;
    }>("conversation.above-prompt-input"),
  ),
  // Renders inline before the conversation pane title (e.g. agent avatar).
  // Multiple contributions render in the order they were registered.
  TitlePrefix: defineSlot<{
    component: ComponentType<{ conversation: ConversationRecord }>;
  }>("conversation.title-prefix"),
};

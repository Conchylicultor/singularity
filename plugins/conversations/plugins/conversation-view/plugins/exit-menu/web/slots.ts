import type { ComponentType } from "react";
import type { Conversation as ConversationRecord } from "@plugins/tasks/plugins/tasks-core/core";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export const ExitMenu = {
  /**
   * One entry in the unified exit menu. Each contributor renders its own
   * `DropdownMenuItem` (icon + label + action) and may return `null` to hide
   * itself based on conversation state. Order is authored as a config override
   * (the slot is reorderable), not a hardcoded prop.
   */
  Item: defineRenderSlot<{
    component: ComponentType<{ conversation: ConversationRecord }>;
  }>("conversation.exit-menu.item", {
    docLabel: (p) => p.id,
  }),
};

import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export interface TaskDraftActionProps {
  /**
   * Insert text at the caret of the card this action is rendered in — every
   * card in the chain, not only the head (chips deserialize inline). Falls back
   * to the end of that card's document when its editor was never focused.
   */
  insertText: (text: string) => void;
}

export const TaskDraftFormSlots = {
  Action: defineRenderSlot<{
    component: ComponentType<TaskDraftActionProps>;
  }>(),
};

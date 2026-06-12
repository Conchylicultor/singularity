import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export interface TaskDraftActionProps {
  /** Append text at the end of the head card editor (chips deserialize inline). */
  insertText: (text: string) => void;
}

export const TaskDraftFormSlots = {
  Action: defineRenderSlot<{
    component: ComponentType<TaskDraftActionProps>;
  }>("task-draft-form.action"),
};

import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export interface PromptEditorActionProps {
  /** Insert text at the caret (or the end when there is none). */
  insertText: (text: string) => void;
  /**
   * Insert text exactly as `insertText` does, then return the whole draft and
   * empty the editor — for an action that inserts and sends in one click.
   */
  takeDraftWith: (text: string) => string;
}

export const PromptEditorSlots = {
  FloatingAction: defineRenderSlot<{
    component: ComponentType<PromptEditorActionProps>;
    alwaysActive?: boolean;
  }>(),
};

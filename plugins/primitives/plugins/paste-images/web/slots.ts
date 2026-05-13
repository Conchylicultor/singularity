import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export interface PromptEditorActionProps {
  insertText: (text: string) => void;
}

export const PromptEditorSlots = {
  FloatingAction: defineRenderSlot<{
    component: ComponentType<PromptEditorActionProps>;
  }>("prompt-editor.floating-action"),
};

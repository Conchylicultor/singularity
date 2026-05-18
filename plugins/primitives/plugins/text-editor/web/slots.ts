import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export interface TextEditorPluginProps {
  onError?: (msg: string) => void;
}

export const TextEditorSlots = {
  Plugin: defineRenderSlot<{
    component: ComponentType<TextEditorPluginProps>;
  }>("text-editor.plugin"),
};

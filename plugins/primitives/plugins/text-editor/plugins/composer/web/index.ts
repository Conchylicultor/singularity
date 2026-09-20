import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { ComposerField, ComposerRule } from "./components/composer-field";
export type { ComposerFieldProps } from "./components/composer-field";
export { ComposerAttachButton } from "./components/attach-button";
export type { ComposerAttachButtonProps } from "./components/attach-button";

export default {
  description:
    "Composer field: a TextEditor whose attach row and control bar live INSIDE its own border, via the editor's bottomSlot. One box, one focus ring, one density.",
  contributions: [],
} satisfies PluginDefinition;

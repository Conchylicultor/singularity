import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { caretAnchor } from "./internal/caret-anchor";
export { atWordBoundary } from "./internal/trigger-state";
export type { Trigger } from "./internal/trigger-state";
export type { CanOpenCtx } from "./internal/find-trigger";
export { useCaretQuery, useCaretMenu } from "./internal/use-caret-trigger";
export type {
  CaretQuery,
  UseCaretQueryOpts,
  UseCaretMenuOpts,
  UseCaretMenuResult,
} from "./internal/use-caret-trigger";
export { CaretTriggerMenu } from "./components/caret-trigger-menu";
export type { CaretTriggerMenuProps } from "./components/caret-trigger-menu";

export default {
  description:
    "Caret-anchored trigger primitive for Lexical editors: derives open-state from editor text, a single-owner arbiter, and the shared caretAnchor.",
  contributions: [],
} satisfies PluginDefinition;

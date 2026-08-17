import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

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
export { useForcedCaretQuery } from "./internal/use-forced-caret-query";
export type { UseForcedCaretQueryOpts } from "./internal/use-forced-caret-query";
export { CaretTriggerMenu } from "./components/caret-trigger-menu";
export type { CaretTriggerMenuProps } from "./components/caret-trigger-menu";

export default {
  description:
    "Caret-anchored trigger primitive for Lexical editors: derives open-state from editor text and a single-owner arbiter.",
  contributions: [],
} satisfies PluginDefinition;

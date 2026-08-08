import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export type { CaretCrossing } from "./internal/caret-crossing";
export {
  CARET_CROSSED_COMMAND,
  announceCaretCrossing,
  crossCaret,
} from "./internal/caret-crossing";

export default {
  description:
    "The caret-crossing channel for Lexical editors: a mover that relocates a caret ACROSS something announces it in the direction of travel, and every consumer of a synthesized caret position observes that one command.",
  contributions: [],
} satisfies PluginDefinition;

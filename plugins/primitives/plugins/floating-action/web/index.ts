import type { PluginDefinition } from "@core";

export {
  FloatingAction,
  FloatingActionFadeIn,
} from "./internal/floating-action";
export type {
  FloatingActionProps,
  FloatingActionFadeInProps,
} from "./internal/floating-action";

export default {
  id: "floating-action",
  name: "Floating Action",
  description:
    "CSS group-hover floating action that morphs from a collapsed pill to an expanded panel with animated dimensions, background, and shadow.",
  contributions: [],
} satisfies PluginDefinition;

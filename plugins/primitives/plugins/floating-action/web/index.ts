import type { PluginDefinition } from "@core";

export {
  FloatingAction,
  FloatingActionFadeIn,
} from "./internal/floating-action";
export type {
  FloatingActionProps,
  FloatingActionFadeInProps,
  FloatingAnchor,
} from "./internal/floating-action";

export default {
  id: "floating-action",
  name: "Floating Action",
  description:
    "Hover-intent floating action: single morphing panel with JS hover intent (close delay) and pointer-events-none on close to prevent flicker.",
  contributions: [],
} satisfies PluginDefinition;

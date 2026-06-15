import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

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
  description:
    "Disclosure-intent floating action: a single morphing panel revealed by hover, focus, or touch via the useDisclosureIntent state machine (grace-delay close, no re-entry dead zone, Esc/outside-press dismiss), over a stable hover hitbox that cures open/close flicker.",
  contributions: [],
} satisfies PluginDefinition;

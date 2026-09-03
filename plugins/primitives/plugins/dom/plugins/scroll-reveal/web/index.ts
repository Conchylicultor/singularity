import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  useRevealOnActive,
  revealElement,
  type RevealOptions,
} from "./internal/use-reveal-on-active";

export default {
  description:
    "Reveal-on-activation primitive: useRevealOnActive() scrolls an element into view only when it TRANSITIONS active (or on explicit revealOnMount intent), never because it remounted already-active — so background data churn can't move the user's scroll. revealElement() is the imperative funnel for event handlers.",
  contributions: [],
} satisfies PluginDefinition;

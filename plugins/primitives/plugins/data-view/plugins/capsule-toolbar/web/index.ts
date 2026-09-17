import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { capsuleToolbar } from "./internal/capsule-toolbar";

export default {
  description:
    "Capsule toolbar arrangement for the data-view primitive: the collapsed view chip, a borderless search field (focused by /), the control triggers as circles and a round filled create button, all in one centred pill.",
  // A value a surface opts into (`<DataView toolbar={capsuleToolbar}>`), not a
  // contribution: the host never looks arrangements up by name.
  contributions: [],
} satisfies PluginDefinition;

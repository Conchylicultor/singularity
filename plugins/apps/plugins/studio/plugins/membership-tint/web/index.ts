import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { STATE_TINT, STATE_LEGEND } from "./internal/tints";

export default {
  description:
    "Single source of truth for the membership-state tint + legend (shared by the Explorer membership band and the Studio graph pane).",
  contributions: [],
} satisfies PluginDefinition;

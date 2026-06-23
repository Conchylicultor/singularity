import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { EffortSelect } from "./components/effort-select";
export type { EffortSelectProps } from "./components/effort-select";

export default {
  description:
    "Registry mapping thinking-mode (effort) levels to Claude CLI delivery (--effort flag / --settings ultracode) and display metadata. Reusable EffortSelect picker.",
  contributions: [],
} satisfies PluginDefinition;

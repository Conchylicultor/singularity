import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { growClass } from "./internal/grow";

export default {
  description:
    "Growing-cell layout primitive: growClass() is the flex child that takes the row's slack (flex-1) while staying floored at its own content width. The half of <Fill> that grows, without the half that gives.",
  contributions: [],
} satisfies PluginDefinition;

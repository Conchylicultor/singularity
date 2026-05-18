import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { resolveIconSvgNodesJson } from "./internal/resolve-svg";

export default {
  id: "avatar",
  name: "Avatar",
  description: "Reusable circular avatar (icon + color) with an optional status-dot overlay and a chooser popover.",
  contributions: [],
} satisfies ServerPluginDefinition;

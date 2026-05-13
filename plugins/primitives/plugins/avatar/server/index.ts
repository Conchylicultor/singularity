import type { ServerPluginDefinition } from "@server/types";

export { resolveIconSvgNodesJson } from "./internal/resolve-svg";

export default {
  id: "avatar",
  name: "Avatar",
  description: "Reusable circular avatar (icon + color) with an optional status-dot overlay and a chooser popover.",
  contributions: [],
} satisfies ServerPluginDefinition;

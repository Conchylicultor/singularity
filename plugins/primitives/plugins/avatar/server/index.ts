import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import "./internal/register-resolver";

export default {
  description: "Reusable circular avatar (icon + color) with an optional status-dot overlay and a chooser popover.",
  contributions: [],
} satisfies ServerPluginDefinition;

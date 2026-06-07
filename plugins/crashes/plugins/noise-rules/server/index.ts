import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { CrashNoiseRule } from "@plugins/crashes/server";

export default {
  name: "Crashes: noise rules",
  description:
    "Built-in noise classification rules for low-signal crashes (e.g. ResizeObserver loop warnings).",
  contributions: [
    CrashNoiseRule({
      id: "resize-observer",
      matches: ({ message, errorType }) =>
        message.toLowerCase().includes("resizeobserver") ||
        (errorType?.toLowerCase().includes("resizeobserver") ?? false),
    }),
  ],
} satisfies ServerPluginDefinition;

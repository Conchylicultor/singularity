import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useAttemptSourceUrl } from "./hooks/use-attempt-source-url";

export default {
  description:
    "Reads back the page a task was filed from, by attempt (useAttemptSourceUrl).",
  contributions: [],
} satisfies PluginDefinition;

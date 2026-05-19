import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Core } from "@plugins/framework/plugins/web-sdk/core";
import { MutationErrorWatcher } from "./components/mutation-error-watcher";

export default {
  id: "crashes-mutation-errors",
  name: "Crashes: Mutation error watcher",
  description:
    "Warning toast and persistent notification for unhandled TanStack Query mutation errors.",
  contributions: [Core.Root({ component: MutationErrorWatcher })],
} satisfies PluginDefinition;

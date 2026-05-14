import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Core } from "@plugins/framework/plugins/web-sdk/core";
import { CrashReporter } from "./components/crash-reporter";

export { report } from "./report";
export type { CrashContext } from "./report";

export default {
  id: "crashes",
  name: "Crashes",
  description: "Reports uncaught browser errors to the server.",
  contributions: [Core.Root({ component: CrashReporter })],
} satisfies PluginDefinition;

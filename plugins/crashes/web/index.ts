import type { PluginDefinition } from "@core";
import { Core } from "@core";
import { CrashReporter } from "./components/crash-reporter";

export { report } from "./report";
export type { CrashContext } from "./report";

export default {
  id: "crashes",
  name: "Crashes",
  description: "Reports uncaught browser errors to the server.",
  contributions: [Core.Root({ component: CrashReporter })],
} satisfies PluginDefinition;

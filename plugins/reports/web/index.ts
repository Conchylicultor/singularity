import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Core } from "@plugins/framework/plugins/web-sdk/core";
import { ReportCollector } from "./components/report-collector";

export { report } from "./report";
export type { ReportContext } from "./report";

export default {
  collapsed: true,
  description: "Reports uncaught browser errors to the server.",
  contributions: [Core.Root({ component: ReportCollector })],
} satisfies PluginDefinition;

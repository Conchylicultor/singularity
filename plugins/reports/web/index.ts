import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { report } from "./report";
export type { ReportContext } from "./report";
export { Reports } from "./slots";

export default {
  collapsed: true,
  description: "Reports uncaught browser errors to the server.",
  contributions: [],
} satisfies PluginDefinition;

import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { defineReportSink } from "./internal/define-report-sink";
export type { ReportSink } from "./internal/define-report-sink";

export default {
  description:
    "Shared soft-reporter slot factory: defineReportSink() creates a module-level register/emit sink so a low-level plugin can own a neutral report body while a domain plugin (e.g. reports) registers the mapping. emit() never throws — it is called on error paths. The single-sourced idiom behind the boundary/endpoint/wedge reporters.",
  contributions: [],
} satisfies PluginDefinition;

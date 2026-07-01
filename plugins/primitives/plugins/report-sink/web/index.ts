import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export default {
  description:
    "Web presence for the report-sink primitive; the runtime-agnostic defineReportSink() factory lives in ./core so both web and server can import it. emit() never throws — it is called on error paths. The single-sourced idiom behind the boundary/endpoint/wedge reporters.",
  contributions: [],
} satisfies PluginDefinition;

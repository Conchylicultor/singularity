import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export default {
  description:
    "Web presence for the report-sink primitive; the runtime-agnostic factories live in ./core so both web and server can import them. defineReportSink() is fire-and-forget and holds reports emitted before a handler registers (bounded), replaying them on register; defineRequestSink() returns the handler's answer and never holds. emit() never throws — it is called on error paths.",
  contributions: [],
} satisfies PluginDefinition;

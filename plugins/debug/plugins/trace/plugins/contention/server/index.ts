import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { contentionClass } from "./internal/class";

export default {
  description:
    "Built-in trace event class 'contention': the cluster-wide system-contention snapshot (OS load average + Postgres backend counts) resolved during async enrich.",
  contributions: [contentionClass.contribution],
} satisfies ServerPluginDefinition;

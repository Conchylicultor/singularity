import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { yieldToMain } from "./internal/yield-to-main";

export default {
  description:
    "Main-thread scheduling primitives (yieldToMain: scheduler.yield → postTask → setTimeout(0)) for cooperative boot/work batching.",
  contributions: [],
} satisfies PluginDefinition;

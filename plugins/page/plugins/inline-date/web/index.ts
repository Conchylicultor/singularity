import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import "./internal/register";

export default {
  description:
    "Inline @ date mentions: type @ in any text block to drop a date chip or schedule a reminder; stored as a [[date:<iso>]] / [[reminder:<id>:<iso>]] token.",
  contributions: [],
} satisfies PluginDefinition;

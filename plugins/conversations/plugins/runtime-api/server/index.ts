import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Runtime } from "@plugins/conversations/server";
import { apiRuntime } from "./internal/api-runtime";

export default {
  id: "conversations-runtime-api",
  name: "Conversations Runtime: api",
  description:
    "Stub placeholder for running Claude via the Anthropic Agent SDK (not yet implemented).",
  register: [Runtime.define(apiRuntime)],
} satisfies ServerPluginDefinition;

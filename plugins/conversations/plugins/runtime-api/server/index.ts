import type { ServerPluginDefinition } from "../../../../../server/src/types";
import "./internal/api-runtime";

export default {
  id: "conversations-runtime-api",
  name: "Conversations Runtime: api",
  description:
    "Stub placeholder for running Claude via the Anthropic Agent SDK (not yet implemented).",
} satisfies ServerPluginDefinition;

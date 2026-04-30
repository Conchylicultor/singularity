import type { ServerPluginDefinition } from "@server/types";
import { claudeCliCallsResource } from "./internal/resources";

export { runClaudePrint, ClaudeCliError } from "./internal/run-claude-print";
export type { ClaudePrintModel, RunClaudePrintInput } from "./internal/run-claude-print";
export { _claudeCliCalls } from "./internal/tables";
export { claudeCliCallsResource } from "./internal/resources";

export default {
  id: "claude-cli",
  name: "Claude CLI",
  description:
    "One-shot Claude CLI helper (`claude --print`) for short, latency-tolerant generations. Reuses the user's local Claude CLI auth — no API key plumbing.",
  resources: [claudeCliCallsResource],
} satisfies ServerPluginDefinition;

import type { ServerPluginDefinition } from "@server/types";

export { runClaudePrint, ClaudeCliError } from "./internal/run-claude-print";
export type { ClaudePrintModel, RunClaudePrintInput } from "./internal/run-claude-print";

export default {
  id: "claude-cli",
  name: "Claude CLI",
  description:
    "One-shot Claude CLI helper (`claude --print`) for short, latency-tolerant generations. Reuses the user's local Claude CLI auth — no API key plumbing.",
} satisfies ServerPluginDefinition;

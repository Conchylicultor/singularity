import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { markTurnSent, clearPendingTurn, usePendingTurn } from "./internal/store";
export type { PendingTurn } from "./internal/store";
export { PendingTurnEcho } from "./components/pending-turn-echo";

export default {
  description:
    "Pure-web library leaf holding the per-conversation pending-turn store (markTurnSent / clearPendingTurn / usePendingTurn) and the optimistic PendingTurnEcho card. The prompt-input writes on a successful turn POST; the jsonl-viewer echoes a dimmed 'Sending…' card until the real user-text event streams in. No slot contributions.",
  contributions: [],
} satisfies PluginDefinition;

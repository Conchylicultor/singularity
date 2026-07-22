import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  sendPendingTurn,
  retryPendingTurn,
  dismissPendingTurn,
  reconcilePendingTurns,
  usePendingTurns,
} from "./internal/store";
export type { PendingTurnRecord, PendingTurnState } from "./internal/store";
export { PendingTurnCard } from "./components/pending-turn-card";

export default {
  description:
    "Owner of the entire turn-send lifecycle: a durable (localStorage) per-conversation pending-turn state machine (sending → posted → queued/sent, failed-post, unconfirmed) that POSTs the turn, verifies delivery against the transcript (normalized-text match), files a report when a 200'd turn never lands, and renders the per-record PendingTurnCard. The prompt-input calls sendPendingTurn on Enter; the jsonl-viewer drives reconcilePendingTurns on every events change. No slot contributions.",
  contributions: [],
} satisfies PluginDefinition;

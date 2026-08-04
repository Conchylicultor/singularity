import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  sendConversationTurn,
  retryPendingTurn,
  dismissPendingTurn,
  reconcilePendingTurns,
  usePendingTurns,
} from "./internal/store";
export type {
  PendingTurnRecord,
  PendingTurnState,
  TurnSend,
} from "./internal/store";
export { defineTurnDelivery } from "./internal/delivery";
export type { TurnDelivery, TurnDeliveryResult } from "./internal/delivery";
export { PendingTurnCard } from "./components/pending-turn-card";

export default {
  description:
    "The single entry point for sending a turn from the browser, and owner of the entire send lifecycle: a durable (localStorage) per-conversation pending-turn state machine (sending → posted → queued/sent, failed-post, unconfirmed) that runs the turn's registered TurnDelivery, verifies delivery against the transcript (normalized-text match), files a report when an accepted turn never lands, and renders the per-record PendingTurnCard. Every surface (prompt input, template chips, Send/Queue/Go, Push & Close, AskUserQuestion answers) calls sendConversationTurn and differs only in its delivery; the jsonl-viewer drives reconcilePendingTurns on every events change. Contributes the turn-send-safety lint rule. No slot contributions.",
  contributions: [],
} satisfies PluginDefinition;

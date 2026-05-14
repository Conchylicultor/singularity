import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useReconnectingWebSocket } from "./use-reconnecting-ws";
export type { ReconnectingWsOptions, ReconnectingWsHandle } from "./use-reconnecting-ws";
export { ReconnectingEventSource } from "./reconnecting-event-source";
export type { ReconnectingEventSourceOptions } from "./reconnecting-event-source";
export { SharedWebSocket } from "./shared-websocket";
export { CrossTabElection } from "./cross-tab-election";
export type { CrossTabElectionCallbacks } from "./cross-tab-election";
export { fetchWithRetry } from "./fetch-with-retry";
export type { FetchWithRetryOptions } from "./fetch-with-retry";
export { publishWsStatus, subscribeWsStatus } from "./ws-status-bus";
export type { WsStatus, WsStatusEvent } from "./ws-status-bus";

export default {
  id: "networking",
  name: "Networking",
  description:
    "WebSocket / EventSource / fetch primitives with reconnection, status-bus, and retry. Used by live-state internally and by terminal/logs/health/stats directly.",
  loadBearing: true,
  contributions: [],
} satisfies PluginDefinition;

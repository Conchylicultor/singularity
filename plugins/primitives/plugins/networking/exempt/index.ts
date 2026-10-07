import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "no-raw-websocket",
    paths: ["web/shared-websocket.ts", "web/use-reconnecting-ws.ts"],
    kind: "sanctioned",
    reason:
      "The networking primitive is where the one shared socket is built: every other client goes through SharedWebSocket or useReconnectingWs.",
  },
  {
    rule: "no-raw-event-source",
    paths: ["."],
    kind: "sanctioned",
    reason:
      "The networking primitive is where ReconnectingEventSource (and its shared leader connection) is built.",
  },
  {
    rule: "endpoints/no-raw-web-fetch",
    paths: ["web"],
    kind: "sanctioned",
    reason:
      "Primitives that legitimately wrap fetch(). These ARE the sanctioned low-level transport the rest of the app is forbidden from reaching for directly.",
  },
] satisfies Exemptions;

import noAdhocTurnSend from "./no-adhoc-turn-send";

export default {
  name: "turn-send-safety",
  rules: {
    "no-adhoc-turn-send": noAdhocTurnSend,
  },
  ignores: {
    // The three sanctioned deliveries — the ONLY web modules allowed to call a
    // turn endpoint. Each is a `defineTurnDelivery` wrapper whose result the
    // store dispatches; the lifecycle around it is never re-implemented.
    "no-adhoc-turn-send": [
      "plugins/conversations/plugins/conversation-view/plugins/pending-turn/web/internal/delivery.ts",
      "plugins/conversations/plugins/conversation-view/plugins/push-and-exit/web/internal/delivery.ts",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/ask-user-question/web/internal/delivery.ts",
    ],
  },
};

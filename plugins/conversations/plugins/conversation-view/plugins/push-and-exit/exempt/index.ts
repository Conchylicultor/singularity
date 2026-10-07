import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "turn-send-safety/no-adhoc-turn-send",
    paths: ["web/internal/delivery.ts"],
    kind: "sanctioned",
    reason:
      "The three sanctioned deliveries — the ONLY web modules allowed to call a turn endpoint. Each is a `defineTurnDelivery` wrapper whose result the store dispatches; the lifecycle around it is never re-implemented.",
  },
] satisfies Exemptions;

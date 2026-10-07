import noAdhocTurnSend from "./no-adhoc-turn-send";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "turn-send-safety",
  rules: {
    "no-adhoc-turn-send": noAdhocTurnSend,
  },
} satisfies LintContribution;

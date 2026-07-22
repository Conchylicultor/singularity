import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Reports } from "@plugins/reports/web";
import { TurnUnconfirmedKindView } from "./components/turn-unconfirmed-kind-view";

export default {
  description:
    "Turn-unconfirmed report kind's Debug → Reports summary view: the one-line preview + elapsed + conversation id for a sent turn that was POSTed and acked but never confirmed in the transcript. The report itself is filed by the conversations pending-turn state machine via the reports web report() API — no collector needed here.",
  contributions: [
    Reports.KindView({
      match: "turn-unconfirmed",
      component: TurnUnconfirmedKindView,
    }),
  ],
} satisfies PluginDefinition;

import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Reports } from "@plugins/reports/web";
import { CHECK_THREAD_STALL_KIND } from "../core";
import { CheckThreadStallSummary } from "./components/check-thread-stall-summary";

export default {
  description:
    "Check-thread-stall report kind's Debug → Reports summary view: one line naming how long the check thread stalled, its top owner and what it was mostly doing. The report itself is filed by the check runner through the report outbox — no collector here.",
  contributions: [
    Reports.KindView({
      match: CHECK_THREAD_STALL_KIND,
      component: CheckThreadStallSummary,
    }),
  ],
} satisfies PluginDefinition;

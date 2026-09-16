import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { checkThreadStallKind } from "./internal/kind";

export default {
  description:
    "Check-thread-stall report kind: validates the check runner's thread-stall payloads (trigger stall = one stall of ≥ 2 s, fingerprinted by its top owner; trigger total = a run whose stalls add up to ≥ 20 s, one row), filed through the report outbox, and renders a task naming the owner, its stacks, the waiting-vs-working split and the run's transcript. Warning, re-arms every 6 h.",
  contributions: [checkThreadStallKind],
} satisfies ServerPluginDefinition;

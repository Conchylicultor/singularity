import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { runEnded } from "./internal/tables-run-ended";

export { defineSupervisedJob } from "./internal/define-supervised-job";
export type {
  DefineSupervisedJobSpec,
  SupervisedJob,
  SupervisedJobClaimMeta,
  SupervisedJobEndedMeta,
  SupervisedJobKindSpec,
  SupervisedJobSpawn,
} from "./internal/define-supervised-job";
export { cancelSupervisedJob } from "./internal/cancel";
// `awaitSupervisedRun` — the observe-then-wait loop on its own — is deliberately
// NOT exported. It was, briefly, for a workflow owning several sequential runs
// (deploy's converge → release → ship), until deploy found an answer needing no
// copy of the close rule at all: wait for the exit marker OR the ledger row
// already being closed, leaving the pid reasoning in the reconciler where it
// lives. With no caller left, exporting it would offer a subtle precondition
// (`pid` must be a child YOU started) that nothing exercises — the footgun
// without the contract. Re-export this one line the day a real caller appears.
// `_supervisedRunEndedTriggers` is exported for drizzle-kit alone: it discovers
// tables by filename glob, and a table it cannot see is a table it emits a
// spurious DROP for.
export {
  runEnded,
  _supervisedRunEndedTriggers,
} from "./internal/tables-run-ended";
export type { RunEndedPayload } from "./internal/tables-run-ended";

export default {
  description:
    "Out-of-process work as an ordinary job: defineSupervisedJob composes defineJob + a supervised-run kind into a handler that claims, spawns detached and SUSPENDS — so no worker slot is held while the child runs — then wakes on the supervisedRun.ended event, re-reads the child's exit marker (the authority; the event is only a wake-up) and records the outcome, surviving any number of backend restarts in between.",
  // The event's own table, mounted here so the register phase completes before
  // any consumer's `onReady` can emit or subscribe. Every supervised job's kind
  // registers itself through its own `defineSupervisedJob` token.
  register: [runEnded],
} satisfies ServerPluginDefinition;

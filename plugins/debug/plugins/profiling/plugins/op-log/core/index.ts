// `OpKind` is NOT re-exported here: it is `infra/worktree/core`'s declaration,
// and a barrel surfacing another plugin's symbol hides the real dependency.
export type {
  OpOutcome,
  OpRecord,
  OpStep,
  OpWait,
  OpenWait,
  OutcomeByKind,
  RawOpRecord,
  TerminalOutcome,
  WaitKind,
} from "./internal/types";
export type { OpGroup } from "./internal/fold";
export {
  foldOpRecords,
  groupByOpId,
  orphanedOps,
  sumWaits,
} from "./internal/fold";

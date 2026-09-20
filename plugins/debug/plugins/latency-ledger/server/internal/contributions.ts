import { Resource } from "@plugins/framework/plugins/server-core/core";
import { ExcludeFromChangeFeed } from "@plugins/database/plugins/change-feed/server";
import {
  ExcludeFromBackup,
  ExcludeFromFork,
} from "@plugins/database/plugins/admin/server";
import {
  _latencyLedgerHostMinute,
  _latencyLedgerInteraction,
  _latencyLedgerMinute,
  _latencyLedgerThreadMinute,
} from "./tables";
import { latencyLedgerRevisionServerResource } from "./revision-resource";

// Observability about THIS machine in THIS database. Three consequences, the same
// for all four tables:
//  - no change feed: a write that happens every minute must not drive a live-state
//    recompute; the card refreshes from the `latency-ledger.revision` tick instead;
//  - no fork: a worktree showing main's numbers as its own would be wrong;
//  - no backup: 35-day observability, not user data.
const ledgerTablePolicies = [
  _latencyLedgerMinute,
  _latencyLedgerHostMinute,
  _latencyLedgerThreadMinute,
  _latencyLedgerInteraction,
].flatMap((table) => [
  ExcludeFromChangeFeed({
    table,
    reason:
      "Written every minute by the ledger itself; the card refreshes from the latency-ledger.revision tick instead.",
  }),
  ExcludeFromFork({
    table,
    reason:
      "Latency measured on the backend that wrote it; a fork showing main's numbers as its own would be wrong.",
  }),
  ExcludeFromBackup({
    table,
    reason: "35-day observability, swept nightly; not user data.",
  }),
]);

export const ledgerContributions = [
  Resource.Declare(latencyLedgerRevisionServerResource),
  ...ledgerTablePolicies,
];

// Zero "app id": the isolation key that namespaces a zero-cache instance's
// replication slot, metadata schema, and CVR/CDC schemas on the upstream
// Postgres. Every worktree's fork DB lives on the SAME embedded cluster (port
// 5433), and a logical replication slot's name is a CLUSTER-global resource — so
// two zero-cache instances sharing the default app id would collide on the slot
// name even though their fork DBs differ. A unique app id per worktree gives
// each its own slot + schemas, so agents stop fighting over the replication slot.
//
// We derive it from the fork DB name (which is the worktree name). Two
// constraints shape the format:
//
//   1. Zero/Postgres require the app id to be lowercase letters, digits, and
//      underscores only — it becomes part of the replication-slot name, whose
//      charset Postgres restricts. Worktree names may contain hyphens (the name
//      regex allows `[a-z0-9-]`), so we map every non-conforming char to `_`.
//
//   2. We KEEP the literal `zero` prefix. The slot/publication cleanup matches
//      the `zero%` / `\_zero%` family (see slot-sql.ts and slot-sweep-job.ts);
//      nesting the per-worktree suffix UNDER that prefix (`zero_<name>`) means
//      every existing reclaim path keeps matching with no change, while the slot
//      and publication names still differ per worktree.
export function zeroAppId(forkDbName: string): string {
  const sanitized = forkDbName.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  return `zero_${sanitized}`;
}

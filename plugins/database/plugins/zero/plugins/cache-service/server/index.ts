import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { zeroSlotSweepJob } from "./internal/slot-sweep-job";

// Re-export the upstream DSN + replica-path constants so boot.ts / the start
// script can reach them via the standard cross-plugin grammar (mirrors how
// embedded/pgbouncer export their path constants). ZERO_CACHE_PORT lives in
// the umbrella core (@plugins/database/plugins/zero/core).
export {
  ZERO_DIR,
  ZERO_REPLICA_FILE,
  ZERO_UPSTREAM_DB,
} from "../shared";

// Slot/replica lifecycle: the clean-slate pre-flight (start.ts) and the reap
// hook both drop a fork's Zero replication slots + publications via this one
// helper; the scheduled sweep self-heals idle/orphaned slots.
export {
  dropZeroReplicationArtifacts,
  worktreeReplicaFile,
} from "./internal/slot-lifecycle";

// The zero-cache PROCESS is supervised per-worktree by the gateway (spawned
// from the worktree spec's `zeroCache` block), not the Bun server. The only
// thing we register on the server is the main-runtime slot sweep — the gateway
// can't run PG DDL, so reclaiming idle/orphaned replication slots is TS-owned.
export default {
  description:
    "zero-cache sidecar service: the supervised Node process that replicates the main Postgres DB into Zero's SQLite replica. Schema-agnostic.",
  register: [zeroSlotSweepJob],
} satisfies ServerPluginDefinition;

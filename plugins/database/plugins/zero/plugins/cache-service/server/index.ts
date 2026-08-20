import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ExcludeSchemaFromFork } from "@plugins/database/plugins/admin/server";
import { zeroSlotSweepJob } from "./internal/slot-sweep-job";

// Re-export the upstream DSN + replica-path constants so boot.ts / the start
// script can reach them via the standard cross-plugin grammar (mirrors how
// embedded/pgbouncer export their path constants). ZERO_CACHE_PORT lives in
// the umbrella core (@plugins/database/plugins/zero/core).
export { ZERO_DIR, ZERO_REPLICA_FILE, ZERO_UPSTREAM_DB } from "../shared";

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
  contributions: [
    // Zero's replication metadata: the CDC log, the client-view records, and
    // the app's own bookkeeping. Each worktree's zero-cache is keyed by its own
    // app id and creates its own schemas on first start (that isolation is what
    // gives each worktree its own replication slot), so main's are never read —
    // they are just inherited weight, ~125 MB of it, and a live fork was
    // measured carrying 64 MB of `zero_0/cdc` it will never touch.
    //
    // The pattern covers the whole family (`zero`, `zero_0`, `zero_0/cdc`,
    // `zero_0/cvr`). Verify it still matches only Zero's own schemas if the app
    // id convention changes.
    //
    // Rows only, NOT the schemas. Zero's `_zero_metadata_0` publication and its
    // `zero_ddl_start_0` / `zero_ddl_end_0` event triggers are database-level
    // objects that live outside these schemas and reference back into them
    // (`zero_0.emit_ddl_end()`, `zero_0.clients`). `pg_dump` emits those
    // regardless, so dropping the schemas outright made `pg_restore` fail on
    // seven statements and took the whole fork down with it. Keeping the DDL
    // costs kilobytes and dangles nothing; the ~125 MB is all in `zero_0/cdc`
    // rows, which this does skip.
    ExcludeSchemaFromFork({
      schema: "zero*",
      drop: "data",
      reason:
        "Replication state describing the source database; each worktree's zero-cache creates its own app-id-keyed schemas on first start.",
    }),
  ],
} satisfies ServerPluginDefinition;

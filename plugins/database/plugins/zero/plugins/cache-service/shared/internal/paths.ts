import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/core";

// zero-cache's local SQLite replica of the upstream Postgres DB. zero-cache
// owns this file; it is rebuilt by an initial COPY on first start.
export const ZERO_DIR = join(SINGULARITY_DIR, "zero");
export const ZERO_REPLICA_FILE = join(ZERO_DIR, "replica.db");

// Upstream DSN zero-cache replicates from. Direct loopback TCP to the embedded
// cluster (port 5433) — NOT PgBouncer (6432: transaction-mode pooling breaks
// the persistent walsender), NOT the Unix socket. `127.0.0.1` not `localhost`
// (node-postgres dials a socket for `localhost`, which breaks replication), and
// no `?schema=public` suffix (zero-cache appends its own). Single-DB Stage 1:
// always the main `singularity` DB, never a worktree fork.
export const ZERO_UPSTREAM_DB =
  "postgresql://singularity@127.0.0.1:5433/singularity";

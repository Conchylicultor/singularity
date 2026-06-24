import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/core";

// Per-instance port override. Default 5433 (dev cluster). A local release preview
// runs PG alongside the dev cluster on the same host, so its loopback TCP listener
// (listen_addresses=127.0.0.1, present for Zero logical replication) would collide
// on 5433 — the preview manager hands each preview a free port via this env var.
// Frozen at import time, like every path constant; the launcher/start scripts set
// it in the process env before this module is first imported.
function resolvePgPort(): number {
  const raw = process.env.SINGULARITY_PG_PORT;
  if (raw === undefined) return 5433;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid SINGULARITY_PG_PORT: ${raw}`);
  }
  return n;
}

export const PG_PORT = resolvePgPort();
export const PG_USER = "singularity";
export const PG_MAJOR = 18;
export const MAX_CONNECTIONS = 500;

export const PG_DIR = join(SINGULARITY_DIR, "postgres");
export const PG_DATA_DIR = join(PG_DIR, `data-pg${PG_MAJOR}`);
export const PG_SOCKET_DIR = join(PG_DIR, "socket");
export const PG_LOG_FILE = join(PG_DIR, "postgres.log");

/**
 * The PG postmaster pidfile under an arbitrary install root. Used by teardown to
 * find a preview's PG (rooted at its `/tmp/sgp-XXXXXX` data dir, not the dev
 * `SINGULARITY_DIR`). `PG_PID_FILE` is the same path under the dev root.
 */
export function pgPostmasterPidFile(root: string): string {
  return join(root, "postgres", `data-pg${PG_MAJOR}`, "postmaster.pid");
}

export const PG_PID_FILE = pgPostmasterPidFile(SINGULARITY_DIR);

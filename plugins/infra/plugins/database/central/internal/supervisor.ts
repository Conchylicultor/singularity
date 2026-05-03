import { existsSync, unlinkSync } from "node:fs";
import { Client } from "pg";
import { pgBin } from "./binaries";
import {
  clearPartialDataDir,
  dataDirPartial,
  dataDirValid,
  initdb,
} from "./initdb";
import {
  migrateFromSystemPg,
  priorMigrationInProgress,
  type MigrationProgress,
} from "./migrate-from-system";
import {
  MAX_CONNECTIONS,
  PG_DATA_DIR,
  PG_LOG_FILE,
  PG_MIGRATING_SENTINEL,
  PG_PID_FILE,
  PG_PORT,
  PG_SOCKET_DIR,
  PG_USER,
  useSystemPg,
} from "./paths";

type MigrationStatus = "idle" | "running" | "completed" | "failed";

interface State {
  ready: boolean;
  crashed: boolean;
  migration: MigrationStatus;
  migrationError: string | null;
  migrationProgress: MigrationProgress;
  watchdog: ReturnType<typeof setInterval> | null;
}

const state: State = {
  ready: false,
  crashed: false,
  migration: "idle",
  migrationError: null,
  migrationProgress: { total: 0, done: 0, current: null },
  watchdog: null,
};

let resolveReady: () => void = () => {};
let rejectReady: (err: unknown) => void = () => {};
export const ready: Promise<void> = new Promise((res, rej) => {
  resolveReady = res;
  rejectReady = rej;
});

async function pgIsReady(): Promise<boolean> {
  // `pg_isready` is not bundled by embedded-postgres; do an SQL-level ping
  // via pg.Client. Connect to the implicit `postgres` DB which always
  // exists in any cluster.
  const c = new Client({
    host: PG_SOCKET_DIR,
    port: PG_PORT,
    user: PG_USER,
    database: "postgres",
    connectionTimeoutMillis: 1500,
  });
  try {
    await c.connect();
    await c.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    try {
      await c.end();
    } catch {}
  }
}

// Use `pg_ctl start` rather than spawning `postgres` directly. pg_ctl
// daemonizes PG (forks + setsid), waits for ready, then exits — leaving PG
// running with no parent process. This decouples PG's lifecycle from
// central's: central can be restarted on every `./singularity build`
// without disrupting the cluster, and worktree backends keep their PG
// connections alive across central blips.
//
// `-w` makes pg_ctl wait for ready by opening a libpq connection. Since we
// listen only on a non-default Unix socket (`-k <PG_SOCKET_DIR>` and empty
// listen_addresses), pg_ctl needs PGHOST/PGPORT/PGUSER in its env to find PG
// — otherwise it would dial a TCP loopback that doesn't exist and time out.
async function startPostgres(): Promise<void> {
  const proc = Bun.spawn(
    [
      pgBin("pg_ctl"),
      "start",
      "-D",
      PG_DATA_DIR,
      "-l",
      PG_LOG_FILE,
      "-o",
      `-k ${PG_SOCKET_DIR} -p ${PG_PORT} -c max_connections=${MAX_CONNECTIONS} -c listen_addresses=`,
      "-w",
      "-t",
      "30",
    ],
    {
      stdout: "inherit",
      stderr: "inherit",
      env: {
        ...process.env,
        PGHOST: PG_SOCKET_DIR,
        PGPORT: String(PG_PORT),
        PGUSER: PG_USER,
      },
    },
  );
  if ((await proc.exited) !== 0) {
    throw new Error(`pg_ctl start failed; see ${PG_LOG_FILE}`);
  }
}

function startWatchdog(): void {
  if (state.watchdog) return;
  state.watchdog = setInterval(async () => {
    if (!state.ready || state.crashed) return;
    if (!(await pgIsReady())) {
      console.error("[database] PG appears down; attempting one re-spawn");
      state.ready = false;
      try {
        // Stale pidfile from the dead postmaster will block `pg_ctl start`;
        // unlink before retrying.
        if (existsSync(PG_PID_FILE)) {
          try {
            unlinkSync(PG_PID_FILE);
          } catch {}
        }
        await startPostgres();
        state.ready = true;
        console.log("[database] PG re-spawned successfully");
      } catch (err) {
        state.crashed = true;
        console.error("[database] PG re-spawn failed; not retrying:", err);
      }
    }
  }, 2000);
  state.watchdog.unref?.();
}

export async function onReady(): Promise<void> {
  if (useSystemPg()) {
    console.log(
      "[database] SINGULARITY_USE_SYSTEM_PG=1 set; not supervising embedded PG",
    );
    state.ready = true;
    resolveReady();
    return;
  }

  try {
    if (priorMigrationInProgress()) {
      throw new Error(
        `Prior migration sentinel found at ${PG_MIGRATING_SENTINEL}. ` +
          `A previous auto-migration from system PG did not complete. ` +
          `Inspect logs, then remove the sentinel and ${PG_DATA_DIR} to retry.`,
      );
    }

    // PG is detached from central's process group, so a freshly-started
    // central instance (e.g. after `./singularity build` restart) finds PG
    // already running. Reattach by socket health rather than spawning a
    // duplicate. Migration must already be complete in this branch — if it
    // weren't, the sentinel above would have thrown.
    if (existsSync(PG_PID_FILE) && (await pgIsReady())) {
      state.ready = true;
      state.migration = "completed";
      startWatchdog();
      resolveReady();
      console.log(
        `[database] embedded PG already running at ${PG_SOCKET_DIR}:${PG_PORT}`,
      );
      return;
    }

    if (dataDirPartial()) {
      console.log(
        "[database] data dir is partial (no PG_VERSION); cleaning and re-initdb",
      );
      clearPartialDataDir();
    }

    const fresh = !dataDirValid();
    if (fresh) {
      await initdb();
    } else if (existsSync(PG_PID_FILE)) {
      // Stale pidfile from a crashed prior run; pg_ctl start will refuse
      // until it's gone.
      console.log("[database] removing stale postmaster.pid");
      try {
        unlinkSync(PG_PID_FILE);
      } catch {}
    }

    await startPostgres();

    state.ready = true;
    startWatchdog();
    resolveReady();
    console.log(
      `[database] embedded PG ready at ${PG_SOCKET_DIR}:${PG_PORT}`,
    );

    // Fire-and-forget the auto-migration. Central must bind its HTTP socket
    // within the gateway's readiness window (~15s); a multi-minute migration
    // inside onReady would race that. Status endpoint surfaces progress.
    if (fresh) {
      state.migration = "running";
      void (async () => {
        try {
          const result = await migrateFromSystemPg(state.migrationProgress);
          state.migration = "completed";
          if (result === "migrated") {
            console.log("[database] auto-migration from system PG complete");
          }
        } catch (err) {
          // Sentinel stays in place so subsequent boots refuse to restart;
          // user can inspect logs and clean up to retry.
          state.migration = "failed";
          state.migrationError = err instanceof Error ? err.message : String(err);
          console.error("[database] auto-migration from system PG failed:", err);
        }
      })();
    } else {
      state.migration = "completed";
    }
  } catch (err) {
    console.error("[database] failed to start embedded PG:", err);
    rejectReady(err);
    throw err;
  }
}

export async function onShutdown(): Promise<void> {
  // PG is a long-lived daemon owned by no central instance — it survives
  // central restart on every `./singularity build`. Shutdown only clears
  // central's local watchdog; PG keeps serving every worktree pool. A full
  // PG stop is a separate manual operation (`pg_ctl stop -D <data>`).
  if (state.watchdog) {
    clearInterval(state.watchdog);
    state.watchdog = null;
  }
  state.ready = false;
}

export interface DatabaseStatus {
  pg: "running" | "stopped" | "crashed";
  useSystemPg: boolean;
  migration: MigrationStatus;
  migrationError: string | null;
  migrationProgress: MigrationProgress;
}

export function status(): DatabaseStatus {
  const base = {
    migration: state.migration,
    migrationError: state.migrationError,
    migrationProgress: state.migrationProgress,
  };
  if (useSystemPg()) return { pg: "running", useSystemPg: true, ...base };
  if (state.crashed) return { pg: "crashed", useSystemPg: false, ...base };
  if (state.ready) return { pg: "running", useSystemPg: false, ...base };
  return { pg: "stopped", useSystemPg: false, ...base };
}

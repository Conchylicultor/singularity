import { Client } from "pg";
import {
  PG_PORT,
  PG_SOCKET_DIR,
  PG_USER,
} from "@plugins/database/plugins/embedded/server";
import type { PgStatsRow } from "../sample-math";

// ONE dedicated raw pg client on the embedded cluster's direct Unix socket —
// no drizzle pool, no PgBouncer. Independence from main's pool is the point:
// sharing it would re-couple the sentinel to the very contention it measures.

// One batched round trip: these views are cluster-global, so any database in
// the cluster sees the whole embedded cluster. wait_event_type IS NULL rows
// (running on CPU) are excluded — the record carries genuine wait states only.
// The backend counts mirror infra/contention's semantics (datname IS NOT NULL)
// so pgActiveBackends/pgTotalBackends keep their historical meaning.
const PG_STATS_SQL = `SELECT
  (SELECT count(*) FROM pg_locks WHERE NOT granted) AS locks_waiting,
  (SELECT sum(blk_read_time) FROM pg_stat_database) AS blk_read_time,
  (SELECT sum(xact_commit) FROM pg_stat_database) AS xact_commit,
  (SELECT json_object_agg(wait_event_type, n)
     FROM (SELECT wait_event_type, count(*)::int AS n
             FROM pg_stat_activity
            WHERE state = 'active' AND wait_event_type IS NOT NULL
            GROUP BY 1) w) AS wait_events,
  (SELECT count(*) FILTER (WHERE state = 'active')
     FROM pg_stat_activity WHERE datname IS NOT NULL) AS active_backends,
  (SELECT count(*) FROM pg_stat_activity WHERE datname IS NOT NULL) AS total_backends`;

export interface SentinelPg {
  /** Null = "pg unreadable this tick" (logged); the sample nulls its pg fields. */
  queryStats(): Promise<PgStatsRow | null>;
  end(): Promise<void>;
}

export function createSentinelPg(
  database: string,
  log: (line: string) => void,
): SentinelPg {
  let client: Client | null = null;

  async function connect(): Promise<Client> {
    const c = new Client({
      host: PG_SOCKET_DIR,
      port: PG_PORT,
      user: PG_USER,
      database,
    });
    // An idle-connection error (pg restart, socket drop) with no handler would
    // crash the worker; drop the client instead — the next tick reconnects.
    c.on("error", (err) => {
      log(`sentinel pg client error: ${String(err)}`);
      client = null;
    });
    await c.connect();
    return c;
  }

  async function destroy(): Promise<void> {
    const c = client;
    client = null;
    if (!c) return;
    try {
      await c.end();
    } catch (err) {
      // Tearing down an already-broken connection; the replacement client is
      // the recovery path. Logged so a systematically-failing end() is visible.
      log(`sentinel pg end failed: ${String(err)}`);
    }
  }

  async function runQuery(): Promise<PgStatsRow> {
    client ??= await connect();
    const result = await client.query(PG_STATS_SQL);
    return result.rows[0] as PgStatsRow;
  }

  return {
    async queryStats(): Promise<PgStatsRow | null> {
      try {
        return await runQuery();
      } catch (err) {
        log(`sentinel pg query failed (reconnecting): ${String(err)}`);
        await destroy();
      }
      // One reconnect attempt within the tick, then degrade.
      try {
        return await runQuery();
        // eslint-disable-next-line promise-safety/no-absorbed-failure -- null IS the discriminated "pg unreadable this tick" state: the sample schema marks the pg fields nullable, both failures are logged, and losing the tick's host/fleet vitals to a pg hiccup would be worse than null pg readings
      } catch (err) {
        log(`sentinel pg reconnect failed: ${String(err)}`);
        await destroy();
        return null;
      }
    },
    async end(): Promise<void> {
      await destroy();
    },
  };
}

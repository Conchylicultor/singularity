import { sql } from "drizzle-orm";
import { db } from "./client";

// db-or-tx executor, same shape as RankExecutor
// (plugins/primitives/plugins/rank/server/internal/helpers.ts).
export type DbExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

// The current transaction's xid8 as decimal text — the causal ack token mutation
// endpoints return so the optimistic-mutation primitive can compare it against
// snapshot watermarks (`pg_snapshot_xmin(pg_current_snapshot())`, same xid8 text
// encoding — compare as BigInt, never lexically). Call it INSIDE the write
// transaction (pass the `tx`): the write already assigned the xid, so the read is
// free; `pg_current_xact_id()` would otherwise assign a fresh xid to whatever
// pool connection it lands on, tokenizing nothing.
export async function currentTxId(exec: DbExecutor): Promise<string> {
  const res = await exec.execute<{ xid: string }>(
    sql.raw(`SELECT pg_current_xact_id()::text AS xid`),
  );
  const xid = res.rows[0]?.xid;
  if (xid === undefined) {
    throw new Error("currentTxId: pg_current_xact_id returned no row");
  }
  return xid;
}

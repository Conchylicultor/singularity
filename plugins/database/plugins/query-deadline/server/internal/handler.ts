import type { QueryDeadlineEvent } from "@plugins/database/server";
import type { recordReport } from "@plugins/reports/server";
import {
  DB_ABANDON_CAP_KIND,
  DB_QUERY_DEADLINE_KIND,
  type DbAbandonCapPayload,
  type DbQueryDeadlinePayload,
} from "../../core";
import type { HitRing } from "./hit-ring";
import { abandonCapMessage, queryDeadlineMessage } from "./render";

export interface QueryDeadlineHandlerDeps {
  /**
   * `recordReport` in the app; a recorder in tests. Named for what it is: the
   * detached-work lint trusts a `void recordReport(…)` because recordReport
   * attributes its own DB write (background lane, no profiling), and it
   * recognises the call by this name.
   */
  recordReport: typeof recordReport;
  /** The in-memory ring behind the `db-query-deadlines` resource. */
  ring: HitRing;
  /** Push the ring to every subscribed tab. */
  notify: () => void;
}

/**
 * The `queryDeadlineSink` handler: one seam event in, one report (and, for a
 * lost query, one ring entry + one push) out.
 *
 * Synchronous, like the seam: it is called from the deadline timer on the
 * rejection path. `recordReport` is a DB write, so it is detached (`void`); a
 * failure inside it surfaces as an unhandled rejection, which the reports
 * plugin itself files. The ring and the push happen FIRST and never wait on it,
 * so the Database health row turns even when the report write is the thing
 * that cannot reach the database.
 *
 * Source `server-caught`: the deadline is an error the server caught in-process
 * and turned into a rejection — no monitor polled for it.
 */
export function createQueryDeadlineHandler(
  deps: QueryDeadlineHandlerDeps,
): (event: QueryDeadlineEvent) => void {
  return (event) => {
    if (event.kind === "abandon-cap") {
      const data: DbAbandonCapPayload = {
        abandoned: event.abandoned,
        cap: event.cap,
      };
      void deps.recordReport({
        kind: DB_ABANDON_CAP_KIND,
        source: "server-caught",
        message: abandonCapMessage(data),
        data,
      });
      return;
    }

    deps.ring.push({
      at: event.at,
      sql: event.sql,
      elapsedMs: event.elapsedMs,
    });
    deps.notify();

    const data: DbQueryDeadlinePayload = {
      sql: event.sql,
      elapsedMs: event.elapsedMs,
      deadlineMs: event.deadlineMs,
      origin: event.origin,
      leased: event.leased,
      reason: event.reason,
    };
    void deps.recordReport({
      kind: DB_QUERY_DEADLINE_KIND,
      source: "server-caught",
      message: queryDeadlineMessage(data),
      data,
    });
  };
}

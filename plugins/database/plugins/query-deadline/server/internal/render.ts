import type { ReportRow } from "@plugins/reports/server";
import { PG_LOG_FILE } from "@plugins/database/plugins/embedded/server";
import { PGBOUNCER_LOG_FILE } from "@plugins/database/plugins/pgbouncer/server";
import {
  DB_ABANDON_CAP_KIND,
  DB_QUERY_DEADLINE_KIND,
  type DbAbandonCapPayload,
  type DbQueryDeadlinePayload,
} from "../../core";
import { formatDurationMs } from "../../shared/format-duration";

// Everything kind-specific that can be said without the reports engine: the
// fingerprints, the one-line messages, and the investigation task bodies. Kept
// apart from the `ReportKind` wiring (kinds.ts) so it is testable without
// evaluating the reports plugin's server barrel.
//
// Every duration printed here arrives in the payload. Nothing spells "60s": the
// default bound and the scoped ones are the database plugin's, and a restated
// number would drift from them the first time either is edited.

/** Where the diagnosis of the only known cause lives. */
export const INCIDENT_DOC =
  "research/2026-09-11-global-live-updates-frozen-by-stray-fd-close.md";

/** The longest stretch of a query label a task title carries. */
const TITLE_SQL_MAX = 80;

function clampOneLine(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

// --- db-query-deadline ------------------------------------------------------

/**
 * One row per (pool, phase, query label) per worktree. The label is the unit
 * anyone acts on: the same statement lost again is the same question ("why does
 * this one hang?"), and a lost query under many different labels is many rows,
 * which is exactly the spread a stray-close hunt wants to see.
 *
 * The pool and phase are part of it because they change the question. The same
 * label on the app pool (through pgbouncer) and on a direct jobs pool is two
 * different sockets, two different logs to read. And every connect has the one
 * label `[connect]`, so without the pool, a jobs pool failing to connect and the
 * app pool failing to connect would merge into one row naming only the latest.
 */
export function queryDeadlineFingerprint(d: DbQueryDeadlinePayload): string {
  return `${DB_QUERY_DEADLINE_KIND}:${d.pool}:${d.phase}:${d.sql}`;
}

export function queryDeadlineMessage(d: DbQueryDeadlinePayload): string {
  return d.phase === "connect"
    ? `Opening a database connection (pool ${d.pool}) got no answer for ` +
        `${formatDurationMs(d.elapsedMs)} and was abandoned`
    : `A database query (pool ${d.pool}) got no answer for ` +
        `${formatDurationMs(d.elapsedMs)} and was abandoned: ${d.sql}`;
}

/**
 * The log that saw the other end of this pool's socket. Only the app pool goes
 * through pgbouncer; every other pool dials Postgres's own socket directly, so
 * its client-side EOFs are in Postgres's log, not pgbouncer's.
 */
function serverLogFor(d: DbQueryDeadlinePayload): {
  file: string;
  signature: string;
  leak: string;
} {
  return d.pool === "app"
    ? {
        file: PGBOUNCER_LOG_FILE,
        signature: "`client unexpected eof`",
        leak: "one leaked pgbouncer client connection",
      }
    : {
        file: PG_LOG_FILE,
        signature:
          "`unexpected EOF on client connection` or " +
          "`could not receive data from client`",
        leak: "one leaked Postgres connection",
      };
}

export function renderQueryDeadlineTask(
  row: ReportRow,
  d: DbQueryDeadlinePayload,
): { title: string; description: string } {
  const log = serverLogFor(d);
  const lines: string[] = [];
  lines.push(
    `${d.phase === "connect" ? "Opening a database connection" : "A database query"} ` +
      `from this server got no answer for ${formatDurationMs(d.elapsedMs)}. ` +
      `The server stopped waiting at its ${formatDurationMs(d.deadlineMs)} ` +
      "deadline: the caller got a `QueryDeadlineExceededError` instead of a " +
      "result, and the connection was **abandoned** — taken out of its pool, " +
      "but deliberately not closed.",
  );
  lines.push("");
  lines.push(
    "**Why this matters.** Before the deadline existed, a call like this " +
      "waited forever. On 2026-09-11 one sat inside a live-state flush, and " +
      "because flushes run one at a time, no database change reached any tab " +
      "for 25+ minutes while the health dot stayed green. On 2026-09-15 a job " +
      "waited 2.5 hours on one. The deadline turns that freeze into this report " +
      "and a pause of at most one deadline.",
  );
  lines.push("");
  lines.push(
    "**Why abandoned, not closed.** The known way to get here is a " +
      "socket whose file handle was closed underneath a running call by other " +
      "code in the same process. `pg` gets no event, and Postgres never sees " +
      "the call. By the time the deadline fires, that handle number may " +
      "already belong to something else, so closing it would kill an innocent " +
      `resource. The cost of abandoning is ${log.leak} until the backend restarts.`,
  );
  lines.push("");
  lines.push("**What to do:**");
  lines.push(
    d.phase === "connect"
      ? "1. Tell a lost connect from a refused or overloaded one. Check that " +
          "the database is up and not at its connection limit around the times " +
          "below; a database that answered nobody is an outage, not a stray close."
      : "1. Tell a lost query from a slow one. If Postgres had the query " +
          "(`pg_stat_activity` shows it running long), it is slow, not lost: find " +
          "why, or — for boot DDL that legitimately waits on locks — give it a " +
          "longer bound with `withQueryDeadline`.",
  );
  lines.push(
    `2. Otherwise, look in \`${log.file}\` around the ` +
      `first and last seen times below for a single, mid-life ${log.signature} ` +
      "on a young socket. That is the signature of a " +
      "stray close. A burst at the same millisecond is just a restart.",
  );
  lines.push(
    `3. Follow "How to find it" in \`${INCIDENT_DOC}\` to hunt the code that ` +
      "closes a file handle it does not own. Each report is another victim " +
      "sighting to add to its table.",
  );
  lines.push("");
  lines.push(
    `**Connection:** pool \`${d.pool}\`, ${d.phase === "connect" ? "while opening the connection" : "while running a query"}`,
  );
  if (d.phase === "query") lines.push(`**Query:** \`${d.sql}\``);
  lines.push(
    `**Waited:** ${formatDurationMs(d.elapsedMs)} ` +
      `(deadline ${formatDurationMs(d.deadlineMs)})`,
  );
  if (d.reason !== null) {
    lines.push(`**Longer deadline granted for:** ${d.reason}`);
  }
  lines.push(
    `**Ran under:** ${d.origin !== null ? `\`${d.origin}\`` : "unknown"}`,
  );
  lines.push("");
  lines.push(`**Occurrences:** ${row.count}`);
  lines.push(`**Worktree:** ${row.worktree}`);
  lines.push(`**First seen:** ${row.firstSeenAt.toISOString()}`);
  lines.push(`**Last seen:** ${row.lastSeenAt.toISOString()}`);
  const title =
    d.phase === "connect"
      ? `[db] Opening a connection got no answer and was abandoned: pool ${d.pool}`
      : `[db] Query got no answer and was abandoned (${d.pool}): ${clampOneLine(d.sql, TITLE_SQL_MAX)}`;
  return { title, description: lines.join("\n") };
}

// --- db-abandon-cap ---------------------------------------------------------

/**
 * One rolling row per worktree (the reports unique index is
 * `(fingerprint, worktree)`). What is reported is the state of this process as
 * a whole, and the upsert refreshes `data` on every occurrence, so the row
 * always shows the latest count.
 *
 * The pool is NOT in the fingerprint. The hold set and its cap are process-wide,
 * shared by every pool, so "past the cap" is one fact about the process; a row
 * per pool would split one count across rows that each show the same total.
 * The payload's `pool` names the connection whose abandon crossed it most
 * recently, and the per-pool breakdown is the `db-query-deadline` rows.
 */
export function abandonCapFingerprint(): string {
  return DB_ABANDON_CAP_KIND;
}

export function abandonCapMessage(d: DbAbandonCapPayload): string {
  return (
    `${d.abandoned} database connections have been abandoned since the server ` +
    `started — more than the ${d.cap} it is built to hold (latest: pool ${d.pool})`
  );
}

export function renderAbandonCapTask(
  row: ReportRow,
  d: DbAbandonCapPayload,
): { title: string; description: string } {
  const lines: string[] = [];
  lines.push(
    `This server has abandoned ${d.abandoned} database connections since it ` +
      `started. The database plugin holds on to at most ${d.cap} of them, and ` +
      "it files this report for every abandon past that.",
  );
  lines.push("");
  lines.push(
    "Each one is a connection whose query got no answer before its deadline " +
      `(the \`${DB_QUERY_DEADLINE_KIND}\` reports next to this one name the ` +
      "queries). The server keeps a reference to every abandoned connection on " +
      "purpose, so that nothing — garbage collection included — ever closes its " +
      "file handle later, when that number may belong to something else. Past " +
      "the cap a newly abandoned connection is still taken out of the pool, but " +
      "is no longer held, so garbage collection may close its handle — the very " +
      "stray close the hold set exists to prevent (see `abandonClient` in " +
      "`plugins/database/plugins/connection/server/internal/`).",
  );
  lines.push("");
  lines.push(
    "**Going past the cap means lost queries are not rare here.** Something " +
      "keeps closing sockets underneath the pool, or the database keeps not " +
      "answering. Each abandoned connection also leaks one pgbouncer client " +
      "connection (app pool) or Postgres connection (every other pool) until the " +
      "backend restarts.",
  );
  lines.push("");
  lines.push(
    `**What to do:** restart the backend to release the leaked connections, ` +
      `then treat the \`${DB_QUERY_DEADLINE_KIND}\` reports as a live incident: ` +
      `follow "How to find it" in \`${INCIDENT_DOC}\`.`,
  );
  lines.push("");
  lines.push(`**Abandoned:** ${d.abandoned}`);
  lines.push(`**Latest abandon:** pool \`${d.pool}\``);
  lines.push(`**Cap:** ${d.cap}`);
  lines.push(`**Occurrences:** ${row.count}`);
  lines.push(`**Worktree:** ${row.worktree}`);
  lines.push(`**First seen:** ${row.firstSeenAt.toISOString()}`);
  lines.push(`**Last seen:** ${row.lastSeenAt.toISOString()}`);
  return {
    title: `[db] ${d.abandoned} abandoned database connections — over the cap of ${d.cap}`,
    description: lines.join("\n"),
  };
}

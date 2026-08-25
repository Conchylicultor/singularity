/**
 * The diagnostic for a column value that disagrees with the column's own schema.
 *
 * A column decoder runs deep inside drizzle — `mapResultRow` on the way out,
 * the `Param` encoder on the way in — far from the `tables.ts` that declared the
 * column, so the stack cannot say which column failed. The label can, and it is
 * read off the built column itself (see `parsed-text.ts`), so it names
 * `table.column` rather than a bare property name.
 *
 * The two directions get different advice because they mean different things. A
 * failed **read** is a row this code did not write. A failed **write** is a
 * caller handing over a value `tsc` said could not exist, so the value was
 * laundered through a cast or arrived unparsed from a request body.
 *
 * How a value is named and rendered comes from `sql-rows` — those are measured
 * facts about how `pg` decodes, and all three boundary guardrails state them
 * once.
 */
import {
  renderSqlValue,
  runtimeTypeOf,
} from "@plugins/database/plugins/sql-rows/core";

/** Which way the value was crossing the driver boundary when it was rejected. */
export type SqlColumnDirection = "read" | "write";

/** Everything known about one column value that failed to parse. */
export interface SqlColumnFailure {
  /** The column, qualified when the table is reachable: `"job_waits.status"`. */
  readonly label: string;
  /** Read = decoding out of Postgres; write = encoding into it. */
  readonly direction: SqlColumnDirection;
  /** What actually arrived, named from the runtime value. */
  readonly receivedType: string;
  /** The value the decoder was handed. */
  readonly received: unknown;
  /** The zod issue's own message — for an enum it lists the allowed values. */
  readonly issueMessage: string;
}

const DIRECTION_PHRASE: Record<SqlColumnDirection, string> = {
  read: "read (decoding a value out of Postgres)",
  write: "write (encoding a value for Postgres)",
};

const WHY: Record<SqlColumnDirection, string> = {
  read:
    "the row holds a value this column's schema does not accept — written by an older " +
    "schema version, by hand, or by a worktree on different code. Widen the schema and " +
    "handle the new value downstream, migrate the rows, or — if the value set legitimately " +
    "evolves — give the column a tolerant schema (`tolerantEnum`), which normalizes the " +
    "value and reports it instead of throwing.",
  write:
    "something is writing a value outside this column's own schema. `tsc` types the insert, " +
    "so the value reached here through a cast or straight off a request body / tool argument. " +
    "Parse it at that boundary — widening the column would only move the failure to the read.",
};

/**
 * Build the message. Pure, so the wording is unit-testable without a database.
 * The runtime type is appended only when it is a surprise: a text column reads
 * back a `string`, so printing `(string)` on every read failure would be noise.
 */
export function formatSqlColumnError(f: SqlColumnFailure): string {
  const value =
    f.receivedType === "string"
      ? renderSqlValue(f.received)
      : `${renderSqlValue(f.received)} (${f.receivedType})`;

  return [
    "a column value is not one of the values its type allows.",
    `  column: ${f.label}`,
    `  direction: ${DIRECTION_PHRASE[f.direction]}`,
    `  value: ${value}`,
    `  ${f.issueMessage}`,
    `  why: ${WHY[f.direction]}`,
  ].join("\n");
}

/**
 * A column value that disagrees with the schema the column decodes through.
 *
 * Thrown from inside the decoder — at the boundary between what the driver holds
 * and what typed code is about to believe — so the mismatch is a loud failure
 * naming the column and the value, rather than a value every downstream `switch`
 * falls through on.
 */
export class SqlColumnError extends Error {
  readonly label: string;
  readonly direction: SqlColumnDirection;
  readonly receivedType: string;
  readonly received: unknown;
  /** The zod error that produced this, for callers that want the full issue list. */
  readonly cause: unknown;

  constructor(failure: SqlColumnFailure, cause: unknown) {
    super(formatSqlColumnError(failure));
    this.name = "SqlColumnError";
    this.label = failure.label;
    this.direction = failure.direction;
    this.receivedType = failure.receivedType;
    this.received = failure.received;
    this.cause = cause;
  }
}

/** Name a runtime value's type the way zod does. Re-exported for the decoder. */
export { runtimeTypeOf };

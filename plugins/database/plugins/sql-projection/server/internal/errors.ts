/**
 * The diagnostic for a projection value that disagrees with its declared shape.
 *
 * A decoder runs deep inside drizzle's `mapResultRow`, far from the file that
 * declared the projection, so the stack is useless for locating the offender.
 * That is why `parsed()` takes a mandatory label: the message has to name the
 * projection itself, because nothing else in the throw can.
 *
 * Everything else — how a runtime value is named, how it is rendered without a
 * serializer throwing over the top of the real error, and the "a string arrived
 * where an array was expected" signature that means pg had no decoder — is
 * imported from `sql-rows`. Those are measured facts about how `pg` decodes, and
 * they are stated once for both halves of the boundary.
 */
import {
  castHintFor,
  renderSqlValue,
  runtimeTypeOf,
} from "@plugins/database/plugins/sql-rows/core";

/** Everything known about one projection value that failed to parse. */
export interface SqlProjectionFailure {
  /** What the projection is called, e.g. `"tasks_v.status"`. */
  readonly label: string;
  /** The zod issue's path inside the value. Empty for the value itself. */
  readonly path: readonly (string | number)[];
  /** What the schema wanted, e.g. `"array"`. Absent for non-type issues. */
  readonly expected: string | undefined;
  /** What actually arrived, named from the runtime value. */
  readonly receivedType: string;
  /** The value the decoder was handed. */
  readonly received: unknown;
  /** The zod issue's own message, the fallback when `expected` is absent. */
  readonly issueMessage: string;
}

/**
 * Build the message. Pure, so the wording is unit-testable without running a
 * query. Every line after the first is conditional — a missing hint prints
 * nothing rather than an `undefined` line.
 */
export function formatSqlProjectionError(f: SqlProjectionFailure): string {
  const lines: string[] = [
    "a SQL projection did not match its declared shape.",
    `  projection: ${f.label}`,
  ];

  const at = f.path.length === 0 ? "" : `at [${f.path.join("][")}]: `;
  lines.push(
    f.expected === undefined || f.path.length > 0
      ? `  ${at}${f.issueMessage}`
      : `  expected ${f.expected}, received ${f.receivedType}`,
  );

  lines.push(`  value: ${renderSqlValue(f.received)}`);

  const hint = castHintFor(f.expected, f.receivedType);
  if (hint !== undefined) lines.push(`  hint: ${hint}`);

  return lines.join("\n");
}

/**
 * A raw SQL projection whose runtime value disagrees with its declared schema.
 *
 * Thrown from inside the decoder — i.e. at the boundary between what the driver
 * produced and what typed code is about to believe — so the mismatch is a loud
 * failure naming the projection and the value, rather than a value everything
 * downstream misreads.
 */
export class SqlProjectionError extends Error {
  readonly label: string;
  readonly path: readonly (string | number)[];
  readonly expected: string | undefined;
  readonly receivedType: string;
  readonly received: unknown;
  /** The zod error that produced this, for callers that want the full issue list. */
  readonly cause: unknown;

  constructor(failure: SqlProjectionFailure, cause: unknown) {
    super(formatSqlProjectionError(failure));
    this.name = "SqlProjectionError";
    this.label = failure.label;
    this.path = failure.path;
    this.expected = failure.expected;
    this.receivedType = failure.receivedType;
    this.received = failure.received;
    this.cause = cause;
  }
}

/** Name a runtime value's type the way zod does. Re-exported for the decoders. */
export { runtimeTypeOf };

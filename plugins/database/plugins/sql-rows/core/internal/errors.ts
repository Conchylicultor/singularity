/**
 * The diagnostic. This file exists because the *default* failure mode of a raw
 * SQL read is silence: `pg` hands back whatever it decoded, the declared row
 * type says otherwise, and the disagreement surfaces hours later as wrong
 * behaviour. A parse turns that into a throw — but a bare `ZodError` says
 * "expected array, received string" and stops, which is the least useful half
 * of the answer. The useful half is *why* a string arrived, and that is the
 * column's Postgres type OID.
 */

/** Everything known about one row that failed to parse. */
export interface SqlRowFailure {
  /** Index of the failing row within the result. */
  readonly rowIndex: number;
  /** Column name, from the first zod issue's path. Absent for a root failure. */
  readonly column: string | undefined;
  /** The column's Postgres type OID, when the result carried `fields`. */
  readonly dataTypeID: number | undefined;
  /** What the schema wanted, e.g. `"array"`. Absent for non-type issues. */
  readonly expected: string | undefined;
  /** What actually arrived, named from the runtime value. */
  readonly receivedType: string;
  /** The runtime value at the issue's path. */
  readonly received: unknown;
  /** The zod issue's own message, the fallback when `expected` is absent. */
  readonly issueMessage: string;
  /** The SQL (or a caller-supplied label), when known. */
  readonly sql: string | undefined;
}

const VALUE_MAX = 200;
const SQL_MAX = 400;

/**
 * Name a runtime value's type the way zod names it, so the message reads
 * `received string` rather than `received object` for `null`.
 */
export function runtimeTypeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  return typeof value;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** Render a value for the message, without ever throwing on a cyclic one. */
function renderValue(value: unknown): string {
  if (value === undefined) return "undefined";
  try {
    return truncate(JSON.stringify(value), VALUE_MAX);
    // eslint-disable-next-line promise-safety/no-bare-catch -- This runs while BUILDING an error message. A cyclic value (or a BigInt) makes JSON.stringify throw, and letting that propagate would replace the real diagnostic — the schema mismatch the caller needs to see — with a serializer stack. Every error is safe to drop here precisely because the fallback below still names the value.
  } catch {
    return truncate(String(value), VALUE_MAX);
  }
}

/**
 * The types whose arrival as a `string` is the signature of "pg had no decoder
 * for this OID". A `string` where a `string` was expected is not interesting;
 * a `string` where an array / object / number / boolean was expected is almost
 * always an unregistered type parser handing back the raw Postgres literal.
 */
const DECODER_SUSPECT_EXPECTED = new Set([
  "array",
  "object",
  "number",
  "bigint",
  "boolean",
]);

function decoderHintApplies(f: SqlRowFailure): boolean {
  return (
    f.receivedType === "string" &&
    DECODER_SUSPECT_EXPECTED.has(f.expected ?? "")
  );
}

const CAST_ADVICE =
  "Cast the column (e.g. `::text[]`, `::int`, `::text`) or register a parser.";

/**
 * Build the message. Pure, so the wording is unit-testable without constructing
 * a failing query. Every line is conditional — a missing OID or missing SQL
 * prints nothing rather than an `undefined` line.
 */
export function formatSqlRowError(f: SqlRowFailure): string {
  const lines: string[] = [
    `row ${f.rowIndex} of a SQL result did not match its declared shape.`,
  ];

  const where = f.column === undefined ? "row" : `column "${f.column}"`;
  lines.push(
    f.expected === undefined
      ? `  ${where}: ${f.issueMessage}`
      : `  ${where}: expected ${f.expected}, received ${f.receivedType}`,
  );

  lines.push(`  value: ${renderValue(f.received)}`);

  const hint = decoderHintApplies(f);
  if (f.dataTypeID !== undefined) {
    lines.push(
      hint
        ? `  pg type: OID ${f.dataTypeID} — pg has no type parser registered for this OID, so the column arrived as its raw Postgres literal. ${CAST_ADVICE}`
        : `  pg type: OID ${f.dataTypeID}`,
    );
  } else if (hint) {
    lines.push(
      `  hint: the column arrived as a string — pg has no type parser registered for its type, so it is the raw Postgres literal. ${CAST_ADVICE}`,
    );
  }

  if (f.sql !== undefined) {
    lines.push(
      `  sql: ${truncate(f.sql.replace(/\s+/g, " ").trim(), SQL_MAX)}`,
    );
  }

  return lines.join("\n");
}

/**
 * A SQL row whose runtime shape disagrees with its declared schema.
 *
 * Thrown at the boundary between untyped SQL and typed code, so the mismatch is
 * a loud failure with the cast that fixes it, rather than a value everything
 * downstream misreads.
 */
export class SqlRowError extends Error {
  readonly rowIndex: number;
  readonly column: string | undefined;
  readonly dataTypeID: number | undefined;
  readonly expected: string | undefined;
  readonly receivedType: string;
  readonly received: unknown;
  readonly sql: string | undefined;
  /** The zod error that produced this, for callers that want the full issue list. */
  readonly cause: unknown;

  constructor(failure: SqlRowFailure, cause: unknown) {
    super(formatSqlRowError(failure));
    this.name = "SqlRowError";
    this.rowIndex = failure.rowIndex;
    this.column = failure.column;
    this.dataTypeID = failure.dataTypeID;
    this.expected = failure.expected;
    this.receivedType = failure.receivedType;
    this.received = failure.received;
    this.sql = failure.sql;
    this.cause = cause;
  }
}

// The filter language's operators — the in-memory half of the op table. Each
// op declares its operand kind (drives validation and the operand type) and a
// `test(value, operand)` that answers exactly as Postgres would. The SQL half
// lives in `server/internal/op-sql.ts`, keyed by the same `LiveOpId`, so the
// two halves cannot drift apart silently: a missing or extra op is a tsc error
// there, and `op-parity.test.ts` pins the answers against a real Postgres.
//
// Null semantics are Postgres's three-valued logic collapsed to "is the row in
// the result": a NULL value fails every comparison, `ne` and `notIn` included
// (`NULL <> 'x'` is NULL, not true). Only `isNull` can match a NULL.

/** A filterable column's value type. Operands are never null — `isNull` is how NULL is asked about. */
export type LiveScalar = string | number | boolean;

type OperandKind = "value" | "list" | "flag";

/** The operand an op of kind `K` takes, over a column whose values are `V`. */
export type OperandOf<K extends OperandKind, V> = K extends "value"
  ? V
  : K extends "list"
    ? readonly V[]
    : boolean;

interface OpDef<K extends OperandKind> {
  operand: K;
  test: (
    value: LiveScalar | null,
    operand: OperandOf<K, LiveScalar>,
  ) => boolean;
}

/** `in` / `notIn` list cap — keeps the HTTP fallback URL bounded. */
export const LIVE_LIST_MAX = 100;

/**
 * Total order over two scalars of the same type, matching Postgres on a `C`
 * collation cluster: numbers numerically, booleans false < true, strings by
 * Unicode code point (UTF-8 byte order). Throws on a type mismatch — comparing
 * a row's `Date` or number against a string operand is a declaration bug, and
 * answering `false` would hide it as "no rows match".
 */
export function compareScalars(a: LiveScalar, b: LiveScalar): number {
  if (typeof a !== typeof b) {
    throw new Error(
      `live filter: cannot compare a ${typeof a} value with a ${typeof b} operand ` +
        `(${JSON.stringify(a)} vs ${JSON.stringify(b)})`,
    );
  }
  if (typeof a === "string") return compareCodePoints(a, b as string);
  if (typeof a === "number") {
    const n = b as number;
    return a < n ? -1 : a > n ? 1 : 0;
  }
  return Number(a) - Number(b as boolean);
}

// JS `<` compares UTF-16 code units, which disagrees with code-point order only
// where a surrogate (U+D800–DFFF, i.e. a code point ≥ U+10000) meets a unit in
// U+E000–FFFF. Remap that one range at the first differing unit.
function compareCodePoints(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    if (x !== y) return codePointRank(x) - codePointRank(y);
  }
  return a.length - b.length;
}

function codePointRank(unit: number): number {
  if (unit < 0xd800) return unit;
  return unit >= 0xe000 ? unit - 0x800 : unit + 0x2000;
}

type AnyOpDef = { [K in OperandKind]: OpDef<K> }[OperandKind];

function valueOp(pass: (cmp: number) => boolean): OpDef<"value"> {
  return {
    operand: "value",
    test: (value, operand) =>
      value !== null && pass(compareScalars(value, operand)),
  };
}

export const liveOps = {
  eq: valueOp((c) => c === 0),
  ne: valueOp((c) => c !== 0),
  gt: valueOp((c) => c > 0),
  gte: valueOp((c) => c >= 0),
  lt: valueOp((c) => c < 0),
  lte: valueOp((c) => c <= 0),
  in: {
    operand: "list",
    test: (value, list) =>
      value !== null && list.some((x) => compareScalars(value, x) === 0),
  },
  notIn: {
    operand: "list",
    test: (value, list) =>
      value !== null && list.every((x) => compareScalars(value, x) !== 0),
  },
  isNull: {
    operand: "flag",
    test: (value, isNull) => (value === null) === isNull,
  },
} as const satisfies Record<string, AnyOpDef>;

export type LiveOpId = keyof typeof liveOps;

/** Every op's operand over a column whose values are `V` — derived from the op table, so it cannot drift. */
export type LiveOperands<V> = {
  [K in LiveOpId]: OperandOf<(typeof liveOps)[K]["operand"], V>;
};

export function isLiveOpId(s: string): s is LiveOpId {
  return Object.hasOwn(liveOps, s);
}

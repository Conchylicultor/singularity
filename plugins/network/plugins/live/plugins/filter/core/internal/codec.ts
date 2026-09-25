import { filterDomains, type FilterDomainId } from "./domains";
import {
  FILTER_MAX_CLAUSES,
  FILTER_MAX_DEPTH,
  type Filter,
  type Filterable,
} from "./expr";
import { getFilterOp, isFilterOpId, LIST_MAX, opAllowsDomain } from "./ops";
import { compareScalars, type FilterScalar } from "./scalars";

// Canonical form and the strict codec. One logical filter has exactly one
// canonical tree and one byte encoding, so a subscription keyed by it can
// never be opened twice for the same query:
//
// - operands: each parsed by its column's DOMAIN (never a value schema) and
//   respelled canonically (instants as `toISOString()`); lists sorted and
//   deduped;
// - groups: same-kind nesting flattened, children sorted and deduped by their
//   canonical JSON, a singleton group replaced by its child;
// - `and: []` is TRUE — the absent filter, `undefined` — and absorbs into an
//   `or`; `or: []` is FALSE and absorbs into an `and`;
// - bounds (checked on the canonical tree): depth ≤ FILTER_MAX_DEPTH, clauses
//   ≤ FILTER_MAX_CLAUSES, lists ≤ LIST_MAX.
//
// `decodeFilter` is strict: it throws unless its input already IS the
// canonical encoding. Every column must be declared: `filterable` is a
// security whitelist, so nothing unknown is dropped or defaulted.

/** A filter the declaration refuses — an unknown column, a wrong-domain op, a bad operand, over a bound. */
export class FilterError extends Error {
  override name = "FilterError";
}

function fail(message: string): never {
  throw new FilterError(`filter: ${message}`);
}

/** Guards recursion on raw input before canonicalization can measure it. */
const RAW_DEPTH_GUARD = 32;

interface Node {
  readonly filter: Filter;
  readonly json: string;
  readonly kind: "and" | "or" | "clause";
  /** For a group: its canonical children. */
  readonly children: readonly Node[];
  readonly depth: number;
  readonly clauses: number;
}

type Canon = Node | "true" | "false";

const FALSE_NODE: Node = {
  filter: { or: [] },
  json: `{"or":[]}`,
  kind: "or",
  children: [],
  depth: 1,
  clauses: 0,
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function canonOperand(
  domain: FilterDomainId,
  column: string,
  op: string,
  raw: unknown,
): FilterScalar {
  const def = filterDomains[domain];
  const parsed = def.operand.safeParse(raw);
  if (!parsed.success) {
    fail(
      `"${column}" ${op}: invalid ${domain} operand ${JSON.stringify(raw)} — ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }
  return def.canonicalOperand(parsed.data!);
}

function canonClause(
  raw: Record<string, unknown>,
  filterable: Filterable,
): Node {
  for (const k of Object.keys(raw)) {
    if (k !== "column" && k !== "op" && k !== "operand") {
      fail(`unknown clause key "${k}" in ${JSON.stringify(raw)}`);
    }
  }
  const { column, op } = raw;
  if (typeof column !== "string" || !Object.hasOwn(filterable, column)) {
    fail(`${JSON.stringify(column)} is not a filterable column`);
  }
  const domain = filterable[column]!.domain;
  if (typeof op !== "string" || !isFilterOpId(op)) {
    fail(`"${column}": unknown op ${JSON.stringify(op)}`);
  }
  if (!opAllowsDomain(op, domain)) {
    fail(`"${column}": op "${op}" does not take a ${domain} column`);
  }
  let filter: Filter;
  let operandJson: string | undefined;
  switch (getFilterOp(op).operand) {
    case "none":
      if (raw.operand !== undefined) {
        fail(`"${column}": ${op} takes no operand`);
      }
      filter = { column, op } as Filter;
      break;
    case "pattern": {
      if (typeof raw.operand !== "string") {
        fail(`"${column}": ${op} takes a string operand`);
      }
      filter = { column, op, operand: raw.operand } as Filter;
      operandJson = JSON.stringify(raw.operand);
      break;
    }
    case "value": {
      const operand = canonOperand(domain, column, op, raw.operand);
      filter = { column, op, operand } as Filter;
      operandJson = JSON.stringify(operand);
      break;
    }
    case "list": {
      if (!Array.isArray(raw.operand)) fail(`"${column}": ${op} takes a list`);
      const list = raw.operand as unknown[];
      if (list.length > LIST_MAX) {
        fail(
          `"${column}": ${op} list exceeds ${LIST_MAX} values (${list.length})`,
        );
      }
      const sorted = list
        .map((x) => canonOperand(domain, column, op, x))
        .sort(compareScalars);
      const operand = sorted.filter(
        (v, i) => i === 0 || compareScalars(sorted[i - 1]!, v) !== 0,
      );
      filter = { column, op, operand } as Filter;
      operandJson = JSON.stringify(operand);
      break;
    }
  }
  const json =
    `{"column":${JSON.stringify(column)},"op":${JSON.stringify(op)}` +
    (operandJson === undefined ? "}" : `,"operand":${operandJson}}`);
  return { filter, json, kind: "clause", children: [], depth: 0, clauses: 1 };
}

function canonGroup(
  kind: "and" | "or",
  raw: unknown,
  filterable: Filterable,
  depth: number,
): Canon {
  if (!Array.isArray(raw)) fail(`"${kind}" takes a list of filters`);
  const identity: Canon = kind === "and" ? "true" : "false";
  const absorbing: Canon = kind === "and" ? "false" : "true";
  const flat: Node[] = [];
  for (const child of raw as unknown[]) {
    const c = canon(child, filterable, depth + 1);
    if (typeof c === "string") {
      if (c === absorbing) return absorbing;
      continue; // the identity
    }
    if (c.kind === kind) flat.push(...c.children);
    else flat.push(c);
  }
  flat.sort((a, b) => compareScalars(a.json, b.json));
  const children = flat.filter(
    (n, i) => i === 0 || flat[i - 1]!.json !== n.json,
  );
  if (children.length === 0) return identity;
  if (children.length === 1) return children[0]!;
  return {
    filter: (kind === "and"
      ? { and: children.map((c) => c.filter) }
      : { or: children.map((c) => c.filter) }) satisfies Filter,
    json: `{"${kind}":[${children.map((c) => c.json).join(",")}]}`,
    kind,
    children,
    depth: 1 + Math.max(...children.map((c) => c.depth)),
    clauses: children.reduce((n, c) => n + c.clauses, 0),
  };
}

function canon(raw: unknown, filterable: Filterable, depth: number): Canon {
  if (depth > RAW_DEPTH_GUARD) {
    fail(`nested deeper than ${RAW_DEPTH_GUARD} levels`);
  }
  if (!isPlainObject(raw)) {
    fail(`a filter is a clause or an and/or group, got ${JSON.stringify(raw)}`);
  }
  const isAnd = Object.hasOwn(raw, "and");
  if (isAnd || Object.hasOwn(raw, "or")) {
    if (Object.keys(raw).length !== 1) {
      fail(
        `a group has exactly one key ("and" or "or"), got ${JSON.stringify(raw)}`,
      );
    }
    return canonGroup(
      isAnd ? "and" : "or",
      isAnd ? raw.and : raw.or,
      filterable,
      depth,
    );
  }
  return canonClause(raw, filterable);
}

function canonTop(raw: unknown, filterable: Filterable): Node | undefined {
  if (raw === undefined) return undefined;
  const c = canon(raw, filterable, 0);
  if (c === "true") return undefined;
  const node = c === "false" ? FALSE_NODE : c;
  if (node.depth > FILTER_MAX_DEPTH) {
    fail(`nested ${node.depth} levels deep (max ${FILTER_MAX_DEPTH})`);
  }
  if (node.clauses > FILTER_MAX_CLAUSES) {
    fail(`${node.clauses} clauses (max ${FILTER_MAX_CLAUSES})`);
  }
  return node;
}

/**
 * Validate `filter` against the declaration and return its canonical tree
 * (`undefined` = the absent filter). Accepts any spelling; throws
 * {@link FilterError} on anything the declaration refuses or over a bound.
 */
export function canonicalizeFilter<F extends Filterable>(
  filter: Filter<F> | undefined,
  filterable: F,
): Filter<F> | undefined {
  return canonTop(filter, filterable)?.filter as Filter<F> | undefined;
}

/** The canonical encoding of `filter`, or `undefined` for the absent filter (omit the param). */
export function encodeFilter<F extends Filterable>(
  filter: Filter<F> | undefined,
  filterable: F,
): string | undefined {
  return canonTop(filter, filterable)?.json;
}

/**
 * STRICT decode: throws {@link FilterError} unless `json` is exactly the
 * canonical encoding of a filter the declaration accepts. The absent filter
 * has no encoding — its param is omitted — so `json` always names a filter.
 */
export function decodeFilter<F extends Filterable>(
  json: string,
  filterable: F,
): Filter<F> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    fail(`invalid JSON ${JSON.stringify(json)}`);
  }
  const node = canonTop(raw, filterable);
  if (node === undefined) {
    fail(`${json} is the absent filter — omit it instead`);
  }
  if (node.json !== json) {
    fail(`${json} is not canonical — the canonical encoding is ${node.json}`);
  }
  return node.filter as Filter<F>;
}

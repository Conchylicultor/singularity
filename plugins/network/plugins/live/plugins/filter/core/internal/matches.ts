import { filterDomains, type FilterDomainId } from "./domains";
import type { Filter, FilterClause, Filterable } from "./expr";
import {
  getFilterOp,
  opAllowsDomain,
  type NormalizedOperand,
  type OperandKind,
} from "./ops";
import type { FilterScalar } from "./scalars";

// In-memory evaluation — the ops' `test` over domain-normalized values. Reads
// no clock (the wire language has no time-relative op), so a server can run
// it per subscription.

function columnDomain(filterable: Filterable, column: string): FilterDomainId {
  if (!Object.hasOwn(filterable, column)) {
    throw new Error(`filter: "${column}" is not a filterable column`);
  }
  return filterable[column]!.domain;
}

function normalizeOperand(
  domain: FilterDomainId,
  kind: OperandKind,
  operand: unknown,
): NormalizedOperand<OperandKind> {
  const def = filterDomains[domain];
  switch (kind) {
    case "none":
      return undefined;
    case "pattern":
      return operand as string;
    case "value":
      return def.operandValue(operand as FilterScalar);
    case "list":
      return (operand as readonly FilterScalar[]).map(def.operandValue);
  }
}

/** One clause's answer for one raw row value (normalized here by the column's domain). */
export function testClause(
  rawValue: unknown,
  clause: FilterClause,
  filterable: Filterable,
): boolean {
  const domain = columnDomain(filterable, clause.column);
  if (!opAllowsDomain(clause.op, domain)) {
    throw new Error(
      `filter: op "${clause.op}" does not take "${clause.column}" (${domain})`,
    );
  }
  const op = getFilterOp(clause.op);
  const value = filterDomains[domain].normalize(rawValue, clause.column);
  return op.test(
    value,
    normalizeOperand(domain, op.operand, clause.operand),
    domain,
  );
}

/**
 * Does `row` match `filter` (`undefined` matches everything)? A row field
 * that is absent (not `null`) throws: the declaration promised the column,
 * and reading `undefined` as NULL would silently answer `isEmpty`.
 */
export function matchesFilter(
  row: Readonly<Record<string, unknown>>,
  filter: Filter | undefined,
  filterable: Filterable,
): boolean {
  const walk = (f: Filter): boolean => {
    if ("and" in f) return f.and.every(walk);
    if ("or" in f) return f.or.some(walk);
    const value = row[f.column];
    if (value === undefined) {
      throw new Error(
        `matchesFilter: row has no "${f.column}" field to filter on`,
      );
    }
    return testClause(value, f, filterable);
  };
  return filter === undefined || walk(filter);
}

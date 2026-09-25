import { sql, type SQL } from "drizzle-orm";
import {
  filterDomains,
  getFilterOp,
  opAllowsDomain,
  opTemplate,
  type Filter,
  type FilterDomainId,
  type Filterable,
  type FilterOpId,
  type Tpl,
} from "@plugins/network/plugins/live/plugins/filter/core";

// The one place the ops' dialect-free templates become drizzle `sql`.
//
// - `T` is the TARGET: a rendered SQL expression, never a drizzle column — an
//   operand is not a stored value, and a column would run its WRITE-side
//   encoder over it (server-query's comparison-target rule).
// - `P` / `X` bind ONE scalar param and `L` ONE array param (`sql.param`: a
//   bare array inside a `sql` template would expand into a `($1, $2, …)`
//   tuple), each cast to the domain's SQL type, so the comparison runs in the
//   domain's type whatever the column's own type is.

interface Binding {
  readonly sqlType: string;
  readonly operand?: unknown;
  readonly list?: readonly unknown[];
  readonly element?: unknown;
}

function param(value: unknown, sqlType: string): SQL {
  return sql`${sql.param(value)}::${sql.raw(sqlType)}`;
}

function need<T>(value: T | undefined, hole: string): T {
  if (value === undefined) {
    throw new Error(`filter: template hole ${hole} has nothing bound to it`);
  }
  return value;
}

function renderTpl(template: Tpl, target: SQL, b: Binding): SQL {
  const chunks: SQL[] = [sql.raw(template.strings[0]!)];
  template.holes.forEach((hole, i) => {
    switch (hole.hole) {
      case "target":
        chunks.push(target);
        break;
      case "operand":
        chunks.push(param(need(b.operand, "P"), b.sqlType));
        break;
      case "list":
        chunks.push(param([...need(b.list, "L")], `${b.sqlType}[]`));
        break;
      case "element":
        chunks.push(param(need(b.element, "X"), b.sqlType));
        break;
      case "orEach": {
        const list = need(b.list, "orEach");
        chunks.push(
          list.length === 0
            ? sql.raw("FALSE")
            : sql`(${sql.join(
                list.map((element) =>
                  renderTpl(hole.body, target, { ...b, element }),
                ),
                sql` OR `,
              )})`,
        );
        break;
      }
    }
    chunks.push(sql.raw(template.strings[i + 1]!));
  });
  return sql.join(chunks);
}

/** One op over one rendered target — the SQL twin of the op's in-memory `test`. */
export function renderOpSql(
  opId: FilterOpId,
  domain: FilterDomainId,
  target: SQL,
  operand: unknown,
): SQL {
  if (!opAllowsDomain(opId, domain)) {
    throw new Error(`filter: op "${opId}" does not take a ${domain} column`);
  }
  const op = getFilterOp(opId);
  const { sqlType } = filterDomains[domain];
  const template = opTemplate(opId, domain);
  switch (op.operand) {
    case "none":
      return renderTpl(template, target, { sqlType });
    case "pattern":
      return renderTpl(template, target, {
        sqlType,
        operand: op.bind ? op.bind(operand as string) : operand,
      });
    case "value":
      return renderTpl(template, target, { sqlType, operand });
    case "list":
      return renderTpl(template, target, {
        sqlType,
        list: operand as readonly unknown[],
      });
  }
}

/**
 * A (decoded) filter as one SQL predicate; `undefined` for the absent filter.
 * `targets` maps every column the filter may name to its RENDERED SQL
 * (`sql\`${table.col}\``); a column missing from it throws.
 */
export function filterSql<F extends Filterable>(
  filter: Filter<F> | undefined,
  targets: Readonly<Record<keyof F & string, SQL>>,
  filterable: F,
): SQL | undefined {
  const walk = (f: Filter): SQL => {
    if ("and" in f || "or" in f) {
      const isAnd = "and" in f;
      const children = isAnd ? f.and : f.or;
      if (children.length === 0) return sql.raw(isAnd ? "TRUE" : "FALSE");
      return sql`(${sql.join(children.map(walk), sql.raw(isAnd ? " AND " : " OR "))})`;
    }
    if (!Object.hasOwn(filterable, f.column)) {
      throw new Error(`filter: "${f.column}" is not a filterable column`);
    }
    const target = (targets as Readonly<Record<string, SQL>>)[f.column];
    if (target === undefined || !Object.hasOwn(targets, f.column)) {
      throw new Error(`filter: "${f.column}" has no SQL target`);
    }
    return renderOpSql(f.op, filterable[f.column]!.domain, target, f.operand);
  };
  return filter === undefined ? undefined : walk(filter as Filter);
}

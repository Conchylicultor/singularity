import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import {
  compareScalars,
  isLiveOpId,
  LIVE_LIST_MAX,
  liveOps,
  type LiveScalar,
} from "./ops";
import {
  LIVE_GROUP_DEFAULT_LIMIT,
  type LiveClause,
  type LiveDecodedGroupQuery,
  type LiveDecodedQuery,
  type LiveGroupParams,
  type LiveOrderBy,
  type LiveQuery,
  type LiveSortDirection,
  type LiveWindowParams,
} from "./query";

// The window query codec. A subscription is just a params tuple, so the SAME
// logical query must always produce the SAME params: encode fills the defaults,
// canonicalizes (sorted columns, sorted + deduped lists, `{ eq: x }` → `x`) and
// drops every part equal to its default. Decode is strict: it validates against
// the declaration, re-encodes, and throws unless the input already was that
// canonical encoding — a non-canonical spelling can never open a second
// subscription for the same query, and the filterable whitelist is a security
// boundary, so nothing unknown is ever defaulted or dropped.

export interface LiveQueryCodecSpec {
  key: string;
  filterable: Readonly<Record<string, ZodParser<LiveScalar> | undefined>>;
  sortable: readonly string[];
  defaultOrderBy: LiveOrderBy<string>;
  defaultLimit: number;
  maxLimit: number;
}

export interface LiveQueryCodec<C extends string, S extends string> {
  encode: (query?: LiveQuery<unknown, S>) => LiveWindowParams;
  decode: (params: Record<string, string>) => LiveDecodedQuery<C, S>;
  /** Canonical encode of a grouping query — the same `where` canonicalisation as a window. */
  encodeGroups: (query: AnyGroupQuery) => LiveGroupParams;
  /** STRICT decode of a grouping query's params (throws unless exactly canonical). */
  decodeGroups: (params: Record<string, string>) => LiveDecodedGroupQuery<C>;
}

/** A grouping query with its column vocabulary erased — the codec validates it at runtime. */
type AnyGroupQuery = { groupBy: string; where?: object; limit?: number };

const PARAM_KEYS = new Set(["limit", "where", "order"]);
const GROUP_PARAM_KEYS = new Set(["groupBy", "limit", "where"]);

export function createLiveQueryCodec<C extends string, S extends string>(
  spec: LiveQueryCodecSpec,
): LiveQueryCodec<C, S> {
  const fail = (message: string): never => {
    throw new Error(`liveCollection("${spec.key}"): ${message}`);
  };

  const checkLimit = (limit: number, what: string): number => {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      fail(`${what} must be a positive integer, got ${limit}`);
    }
    if (limit > spec.maxLimit) {
      fail(`${what} ${limit} exceeds maxLimit ${spec.maxLimit}`);
    }
    return limit;
  };

  const parseOperand = (column: string, raw: unknown): LiveScalar => {
    if (raw === null || raw === undefined) {
      fail(
        `"${column}": an operand is never null — use { isNull: true } to match NULL`,
      );
    }
    if (typeof raw === "number" && !Number.isFinite(raw)) {
      fail(`"${column}": operand must be a finite number, got ${raw}`);
    }
    const parsed = spec.filterable[column]!.safeParse(raw);
    if (!parsed.success) {
      fail(
        `"${column}": invalid operand ${JSON.stringify(raw)} — ${parsed.error.message}`,
      );
    }
    return parsed.data!;
  };

  const toClause = (column: string, filter: unknown): LiveClause<C> => {
    if (spec.filterable[column] === undefined) {
      fail(`"${column}" is not a filterable column`);
    }
    const isOpObject =
      typeof filter === "object" && filter !== null && !Array.isArray(filter);
    if (!isOpObject) {
      return {
        column: column as C,
        op: "eq",
        operand: parseOperand(column, filter),
      };
    }
    const entries = Object.entries(filter);
    if (entries.length !== 1) {
      fail(
        `"${column}": a filter takes exactly one operator, got ${JSON.stringify(filter)}`,
      );
    }
    const [op, raw] = entries[0]!;
    if (!isLiveOpId(op)) fail(`"${column}": unknown operator "${op}"`);
    switch (liveOps[op as keyof typeof liveOps].operand) {
      case "value":
        return {
          column: column as C,
          op: op as "eq",
          operand: parseOperand(column, raw),
        };
      case "list": {
        if (!Array.isArray(raw)) fail(`"${column}": ${op} takes a list`);
        const list = raw as unknown[];
        if (list.length > LIVE_LIST_MAX) {
          fail(
            `"${column}": ${op} list exceeds ${LIVE_LIST_MAX} values (${list.length})`,
          );
        }
        const values = list.map((v) => parseOperand(column, v));
        return {
          column: column as C,
          op: op as "in",
          operand: canonicalList(values),
        };
      }
      case "flag":
        if (typeof raw !== "boolean")
          fail(`"${column}": ${op} takes a boolean`);
        return { column: column as C, op: "isNull", operand: raw as boolean };
    }
  };

  const toClauses = (where: object): LiveClause<C>[] =>
    Object.entries(where)
      // An absent optional key: TS lets `{ status: maybeStatus }` through as undefined.
      .filter(([, filter]) => filter !== undefined)
      .sort(([a], [b]) => compareScalars(a, b))
      .map(([column, filter]) => toClause(column, filter));

  const toOrderBy = (raw: unknown): LiveOrderBy<S> => {
    if (!Array.isArray(raw) || raw.length === 0) {
      fail(
        `orderBy must be a non-empty list of [column, direction], got ${JSON.stringify(raw)}`,
      );
    }
    const seen = new Set<string>();
    return (raw as unknown[]).map((entry) => {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== "string" ||
        (entry[1] !== "asc" && entry[1] !== "desc")
      ) {
        return fail(
          `orderBy entry must be [column, "asc" | "desc"], got ${JSON.stringify(entry)}`,
        );
      }
      const [column, dir] = entry as [string, LiveSortDirection];
      if (!spec.sortable.includes(column))
        fail(`"${column}" is not a sortable column`);
      if (seen.has(column)) fail(`orderBy names "${column}" twice`);
      seen.add(column);
      return [column as S, dir] as const;
    });
  };

  const defaultOrderJson = JSON.stringify(toOrderBy(spec.defaultOrderBy));
  checkLimit(spec.defaultLimit, "default.limit");

  const encodeDecoded = (q: LiveDecodedQuery<C, S>): LiveWindowParams => {
    const params: LiveWindowParams = { limit: String(q.limit) };
    if (q.where.length > 0) params.where = whereJson(q.where);
    const order = JSON.stringify(q.orderBy);
    if (order !== defaultOrderJson) params.order = order;
    return params;
  };

  const encode = (query?: LiveQuery<unknown, S>): LiveWindowParams =>
    encodeDecoded({
      limit: checkLimit(query?.limit ?? spec.defaultLimit, "limit"),
      where: toClauses(query?.where ?? {}),
      orderBy: toOrderBy(query?.orderBy ?? spec.defaultOrderBy),
    });

  const decode = (params: Record<string, string>): LiveDecodedQuery<C, S> => {
    for (const k of Object.keys(params)) {
      if (!PARAM_KEYS.has(k)) fail(`decode: unknown param "${k}"`);
    }
    const { limit, where, order } = params;
    if (limit === undefined || !/^[1-9][0-9]*$/.test(limit)) {
      fail(
        `decode: params.limit must be a canonical positive-integer string, got ${JSON.stringify(limit)}`,
      );
    }
    const decoded: LiveDecodedQuery<C, S> = {
      limit: checkLimit(Number(limit), "limit"),
      where: where === undefined ? [] : toClauses(parseJsonObject(where, fail)),
      orderBy:
        order === undefined
          ? toOrderBy(spec.defaultOrderBy)
          : toOrderBy(parseJson(order, fail)),
    };
    const canonical = encodeDecoded(decoded);
    if (!sameParams(canonical, params)) {
      fail(
        `decode: params are not canonical — got ${JSON.stringify(params)}, ` +
          `the canonical encoding is ${JSON.stringify(canonical)}`,
      );
    }
    return decoded;
  };

  // ── Grouping queries ───────────────────────────────────────────────
  // Same discipline as the window: canonical encode, strict decode. The group
  // limit is bounded by `LIVE_LIST_MAX` rather than the collection's
  // `maxLimit` — a picked set of groups must still fit one `in` filter.

  const checkGroupLimit = (limit: number): number => {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      fail(`group limit must be a positive integer, got ${limit}`);
    }
    if (limit > LIVE_LIST_MAX) {
      fail(`group limit ${limit} exceeds ${LIVE_LIST_MAX}`);
    }
    return limit;
  };
  const checkGroupBy = (column: unknown): C => {
    if (typeof column !== "string" || spec.filterable[column] === undefined) {
      fail(
        `groupBy ${JSON.stringify(column)} is not a filterable column — only a declared filterable column can be grouped on`,
      );
    }
    return column as C;
  };
  const encodeDecodedGroups = (
    q: LiveDecodedGroupQuery<C>,
  ): LiveGroupParams => {
    const params: LiveGroupParams = {
      groupBy: q.groupBy,
      limit: String(q.limit),
    };
    if (q.where.length > 0) params.where = whereJson(q.where);
    return params;
  };

  const encodeGroups = (query: AnyGroupQuery): LiveGroupParams => {
    // Typed out (`orderBy?: never`), but an untyped caller must not have its
    // order silently ignored.
    if ((query as { orderBy?: unknown }).orderBy !== undefined) {
      fail(
        "a grouping query has a fixed order (count desc, then value) — it takes no orderBy",
      );
    }
    return encodeDecodedGroups({
      groupBy: checkGroupBy(query.groupBy),
      limit: checkGroupLimit(query.limit ?? LIVE_GROUP_DEFAULT_LIMIT),
      where: toClauses(query.where ?? {}),
    });
  };

  const decodeGroups = (
    params: Record<string, string>,
  ): LiveDecodedGroupQuery<C> => {
    for (const k of Object.keys(params)) {
      if (!GROUP_PARAM_KEYS.has(k)) fail(`decodeGroups: unknown param "${k}"`);
    }
    const { groupBy, limit, where } = params;
    if (limit === undefined || !/^[1-9][0-9]*$/.test(limit)) {
      fail(
        `decodeGroups: params.limit must be a canonical positive-integer string, got ${JSON.stringify(limit)}`,
      );
    }
    const decoded: LiveDecodedGroupQuery<C> = {
      groupBy: checkGroupBy(groupBy),
      limit: checkGroupLimit(Number(limit)),
      where: where === undefined ? [] : toClauses(parseJsonObject(where, fail)),
    };
    const canonical = encodeDecodedGroups(decoded);
    if (!sameParams(canonical, params)) {
      fail(
        `decodeGroups: params are not canonical — got ${JSON.stringify(params)}, ` +
          `the canonical encoding is ${JSON.stringify(canonical)}`,
      );
    }
    return decoded;
  };

  return { encode, decode, encodeGroups, decodeGroups };
}

function canonicalList(values: LiveScalar[]): LiveScalar[] {
  const sorted = [...values].sort(compareScalars);
  return sorted.filter(
    (v, i) => i === 0 || compareScalars(sorted[i - 1]!, v) !== 0,
  );
}

// Hand-built so key order is exactly the (sorted) clause order — a JS object
// would hoist integer-like keys ahead of the rest.
function whereJson(where: readonly LiveClause[]): string {
  const parts = where.map(
    (c) =>
      `${JSON.stringify(c.column)}:${JSON.stringify(c.op === "eq" ? c.operand : { [c.op]: c.operand })}`,
  );
  return `{${parts.join(",")}}`;
}

function parseJson(raw: string, fail: (m: string) => never): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    return fail(`decode: invalid JSON ${JSON.stringify(raw)}`);
  }
}

function parseJsonObject(raw: string, fail: (m: string) => never): object {
  const v = parseJson(raw, fail);
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    fail(
      `decode: params.where must be a JSON object, got ${JSON.stringify(raw)}`,
    );
  }
  return v as object;
}

function sameParams(
  a: LiveWindowParams | LiveGroupParams,
  b: Record<string, string>,
): boolean {
  const keys = Object.keys(b);
  return (
    keys.length === Object.keys(a).length &&
    keys.every((k) => (a as Record<string, string | undefined>)[k] === b[k])
  );
}

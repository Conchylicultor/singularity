import {
  decodeFilter,
  encodeFilter,
  LIST_MAX,
  type Filter,
  type Filterable,
} from "@plugins/network/plugins/live/plugins/filter/core";
import {
  LIVE_GROUP_DEFAULT_LIMIT,
  type LiveDecodedGroupQuery,
  type LiveDecodedQuery,
  type LiveGroupableDomain,
  type LiveGroupParams,
  type LiveOrderBy,
  type LiveSortDirection,
  type LiveWindowParams,
} from "./query";

// The window query codec. A subscription is just a params tuple, so the SAME
// logical query must always produce the SAME params: encode fills the defaults,
// canonicalizes (the filter through the filter language's `encodeFilter` —
// object sugar and trees alike) and drops every part equal to its default.
// Decode is strict: the filter through `decodeFilter` (throws unless exactly
// canonical), the rest by re-encoding and comparing — a non-canonical spelling
// can never open a second subscription for the same query, and the filterable
// whitelist is a security boundary, so nothing unknown is ever defaulted or
// dropped.

export interface LiveQueryCodecSpec {
  key: string;
  filterable: Filterable;
  sortable: readonly string[];
  defaultOrderBy: LiveOrderBy<string>;
  defaultLimit: number;
  maxLimit: number;
}

/** A window query with its column vocabulary erased — the codec validates it at runtime. */
type AnyWindowQuery = {
  where?: object;
  orderBy?: LiveOrderBy<string>;
  limit?: number;
};

/** A grouping query with its column vocabulary erased — the codec validates it at runtime. */
type AnyGroupQuery = { groupBy: string; where?: object; limit?: number };

export interface LiveQueryCodec<C extends string, S extends string> {
  encode: (query?: AnyWindowQuery) => LiveWindowParams;
  decode: (params: Record<string, string>) => LiveDecodedQuery<S>;
  /** Canonical encode of a grouping query — the same `where` canonicalisation as a window. */
  encodeGroups: (query: AnyGroupQuery) => LiveGroupParams;
  /** STRICT decode of a grouping query's params (throws unless exactly canonical). */
  decodeGroups: (params: Record<string, string>) => LiveDecodedGroupQuery<C>;
}

const PARAM_KEYS = new Set(["limit", "where", "order"]);
const GROUP_PARAM_KEYS = new Set(["groupBy", "limit", "where"]);

/** Keys a `where` object spells a `Filter` tree with — never filterable column names. */
export const RESERVED_COLUMNS: ReadonlySet<string> = new Set([
  "and",
  "or",
  "column",
  "op",
  "operand",
]);

const GROUPABLE_DOMAINS: ReadonlySet<string> = new Set<LiveGroupableDomain>([
  "text",
  "number",
  "boolean",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function createLiveQueryCodec<C extends string, S extends string>(
  spec: LiveQueryCodecSpec,
): LiveQueryCodec<C, S> {
  const fail = (message: string): never => {
    throw new Error(`liveCollection("${spec.key}"): ${message}`);
  };

  for (const column of Object.keys(spec.filterable)) {
    if (RESERVED_COLUMNS.has(column)) {
      fail(
        `"${column}" cannot be a filterable column — a where object uses it to spell a filter tree`,
      );
    }
  }

  const checkLimit = (limit: number, what: string): number => {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      fail(`${what} must be a positive integer, got ${limit}`);
    }
    if (limit > spec.maxLimit) {
      fail(`${what} ${limit} exceeds maxLimit ${spec.maxLimit}`);
    }
    return limit;
  };

  // The object sugar → a Filter tree (an AND of clauses). A plain value is
  // `eq`; an object is exactly one `{ op: operand }`, a no-operand op spelled
  // `{ isEmpty: true }`. Every column / op / operand check is the filter
  // language's — this only reshapes.
  const sugarClause = (column: string, filter: unknown): Filter => {
    if (filter === null) {
      fail(
        `"${column}": an operand is never null — use { isEmpty: true } to match NULL`,
      );
    }
    if (!isPlainObject(filter)) return { column, op: "eq", operand: filter };
    const entries = Object.entries(filter);
    if (entries.length !== 1) {
      fail(
        `"${column}": a filter takes exactly one operator, got ${JSON.stringify(filter)}`,
      );
    }
    const [op, operand] = entries[0]!;
    if (op === "isEmpty" || op === "isNotEmpty") {
      if (operand !== true) {
        fail(`"${column}": ${op} is spelled { ${op}: true }`);
      }
      return { column, op } as Filter;
    }
    return { column, op, operand } as Filter;
  };

  /** Any `where` spelling → a (not yet canonical) Filter, or `undefined`. */
  const toFilter = (where: object | undefined): Filter | undefined => {
    if (where === undefined) return undefined;
    if (!isPlainObject(where)) {
      return fail(
        `where must be an object (per-column sugar) or a filter tree, got ${JSON.stringify(where)}`,
      );
    }
    const keys = Object.keys(where);
    if (keys.some((k) => RESERVED_COLUMNS.has(k))) return where as Filter;
    return {
      and: keys
        // An absent optional key: TS lets `{ status: maybeStatus }` through as undefined.
        .filter((column) => where[column] !== undefined)
        .map((column) => sugarClause(column, where[column])),
    };
  };

  const encodeWhere = (where: object | undefined): string | undefined => {
    const filter = toFilter(where);
    try {
      return encodeFilter(filter, spec.filterable);
    } catch (err) {
      if (err instanceof Error) fail(err.message);
      throw err;
    }
  };

  const decodeWhere = (json: string | undefined): Filter | undefined => {
    if (json === undefined) return undefined;
    try {
      return decodeFilter(json, spec.filterable);
    } catch (err) {
      if (err instanceof Error) fail(`decode: ${err.message}`);
      throw err;
    }
  };

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

  const windowParams = (
    limit: number,
    where: string | undefined,
    orderBy: LiveOrderBy<S>,
  ): LiveWindowParams => {
    const params: LiveWindowParams = { limit: String(limit) };
    if (where !== undefined) params.where = where;
    const order = JSON.stringify(orderBy);
    if (order !== defaultOrderJson) params.order = order;
    return params;
  };

  const encode = (query?: AnyWindowQuery): LiveWindowParams =>
    windowParams(
      checkLimit(query?.limit ?? spec.defaultLimit, "limit"),
      encodeWhere(query?.where),
      toOrderBy(query?.orderBy ?? spec.defaultOrderBy),
    );

  const decode = (params: Record<string, string>): LiveDecodedQuery<S> => {
    for (const k of Object.keys(params)) {
      if (!PARAM_KEYS.has(k)) fail(`decode: unknown param "${k}"`);
    }
    const { limit, where, order } = params;
    if (limit === undefined || !/^[1-9][0-9]*$/.test(limit)) {
      fail(
        `decode: params.limit must be a canonical positive-integer string, got ${JSON.stringify(limit)}`,
      );
    }
    const decoded: LiveDecodedQuery<S> = {
      limit: checkLimit(Number(limit), "limit"),
      where: decodeWhere(where),
      orderBy:
        order === undefined
          ? toOrderBy(spec.defaultOrderBy)
          : toOrderBy(parseJson(order, fail)),
    };
    // The filter is already strictly canonical; this pins limit / order.
    const canonical = windowParams(decoded.limit, where, decoded.orderBy);
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
  // limit is bounded by `LIST_MAX` rather than the collection's `maxLimit` — a
  // picked set of groups must still fit one `in` filter.

  const checkGroupLimit = (limit: number): number => {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      fail(`group limit must be a positive integer, got ${limit}`);
    }
    if (limit > LIST_MAX) {
      fail(`group limit ${limit} exceeds ${LIST_MAX}`);
    }
    return limit;
  };
  const checkGroupBy = (column: unknown): C => {
    if (typeof column !== "string" || !Object.hasOwn(spec.filterable, column)) {
      fail(
        `groupBy ${JSON.stringify(column)} is not a filterable column — only a declared filterable column can be grouped on`,
      );
    }
    const domain = spec.filterable[column as string]!.domain;
    if (!GROUPABLE_DOMAINS.has(domain)) {
      fail(
        `groupBy "${column as string}" is a ${domain} column — only text / number / boolean columns can be grouped on`,
      );
    }
    return column as C;
  };
  const groupParams = (
    groupBy: C,
    limit: number,
    where: string | undefined,
  ): LiveGroupParams => {
    const params: LiveGroupParams = { groupBy, limit: String(limit) };
    if (where !== undefined) params.where = where;
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
    return groupParams(
      checkGroupBy(query.groupBy),
      checkGroupLimit(query.limit ?? LIVE_GROUP_DEFAULT_LIMIT),
      encodeWhere(query.where),
    );
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
      where: decodeWhere(where),
    };
    const canonical = groupParams(decoded.groupBy, decoded.limit, where);
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

function parseJson(raw: string, fail: (m: string) => never): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    return fail(`decode: invalid JSON ${JSON.stringify(raw)}`);
  }
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

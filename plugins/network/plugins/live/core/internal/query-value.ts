import type { z } from "zod";
import { canonicalJson } from "@plugins/packages/plugins/canonical-params/core";
import { ResourceContractError } from "@plugins/packages/plugins/resource-protocol/core";

// The codecs of a value whose question is STRUCTURED (`liveValue(key, { query })`)
// and of a cursor-paged one (`{ query, paged }`). A value's params are wire
// strings, and everything below the declaration — the runtime, WS frames, the
// HTTP fallback's `URLSearchParams`, tuple keys, ETags, the query cache — keeps
// them that way. So the typed question rides as ONE string param, `q`: its
// canonical JSON (`canonicalJson`) after the schema parsed it, which folds a
// default into the one tuple of the question it defaults to.
//
// ONE codec per value, shared by the declaration's params gate, the browser's
// read (`useLive`) and the served half (`shared/compile-value.ts` decodes the
// tuple for the loader, and encodes `notify(query)`'s), so the three cannot
// spell a question differently.
//
// Decode is STRICT — the window codec's rule: the tuple's `q` must be exactly
// what encoding its own decoded value gives back. That makes "one logical
// question, one tuple" true at runtime, and it refuses a schema whose parse is
// not idempotent (a transform that moves its own output) without walking the
// zod tree: every read of such a value is a contract mismatch. Refinements
// pass — they check, they do not rewrite.
//
// Two kinds of failure, thrown differently (as in `query-codec.ts`): an ENCODE
// that fails is this bundle's own bug (a query its schema refuses, one over the
// size bound) — a plain `Error`, crashing loudly at the read. A DECODE that
// fails is a tuple that does not match the declaration — a
// `ResourceContractError`, which the runtime refuses as `contract-mismatch`.

/**
 * The bound on a value's encoded `q`, in UTF-8 bytes. Encoding past it throws:
 * the HTTP fallback carries `q` in a URL. A question that big is a body, not a
 * tuple — and a structured query is a few hundred bytes.
 */
export const LIVE_QUERY_MAX_BYTES = 2048;

/** The bound on a page cursor (`c`), in UTF-8 bytes — the server mints it, so a longer one is its bug. */
export const LIVE_PAGE_CURSOR_MAX_BYTES = 1024;

/** A typed-query value's wire params: the question's canonical JSON. */
export type LiveQueryParams = { q: string };

/**
 * One page tuple of a paged value: the question, the page size `n` (decimal),
 * and the server's opaque cursor `c` — absent on the first page.
 */
export type LivePageParams = { q: string; n: string; c?: string };

/** What a paged value's loader is asked for one page. */
export interface LivePageRequest {
  /** The previous page's `nextCursor`; `null` = the first page. */
  cursor: string | null;
  /** At most this many items. */
  limit: number;
}

/**
 * One page of a paged value — the derived wire schema's shape. `meta` (a
 * total, say) is present exactly when the declaration has a `meta` schema.
 */
export type LivePage<Item, Meta> = {
  items: Item[];
  /** The cursor of the page after this one; `null` = this is the last page. */
  nextCursor: string | null;
} & ([Meta] extends [undefined] ? { meta?: undefined } : { meta: Meta });

/**
 * A query schema: parses the caller's question (`QIn`, its input — defaults
 * optional) into the loader's (`Q`, its output). Any JSON-safe zod schema.
 */
export type LiveQuerySchema<Q, QIn> = z.ZodType<Q, z.ZodTypeDef, QIn>;

/** A typed-query value's codec (`LiveQueryValue.query`). */
export interface LiveQueryCodec<Q, QIn> {
  /** The caller's question → its one tuple. Throws (plain `Error`) on a question the schema refuses, or one over `LIVE_QUERY_MAX_BYTES`. */
  encode(query: QIn): LiveQueryParams;
  /** A tuple → the loader's question. Strict: throws `ResourceContractError` unless the tuple is exactly `{ q }` and `q` is canonical. */
  decode(params: Record<string, string>): Q;
}

/** A paged value's codec (`LivePagedValue.query`). */
export interface LivePageCodec<Q, QIn> {
  /** The caller's question and one page → that page's tuple. */
  encode(query: QIn, page: LivePageRequest): LivePageParams;
  /** An already-encoded question (`encodeQuery`'s) and one page → that page's tuple. */
  page(q: string, page: LivePageRequest): LivePageParams;
  /** A page tuple → the question and the page. Strict, as {@link LiveQueryCodec.decode}. */
  decode(params: Record<string, string>): { query: Q } & LivePageRequest;
  /** The question's canonical `q` alone — what every page tuple of it shares. */
  encodeQuery(query: QIn): string;
}

/**
 * The question half both codecs share: `q` ⇄ the schema's output, strict.
 * Exported for the paged hook and the served half; a value's own codec is
 * what a reader uses.
 */
export function queryCodec<Q, QIn>(
  key: string,
  schema: LiveQuerySchema<Q, QIn>,
): { encode(query: QIn): string; decode(q: string): Q } {
  const reject = (detail: string): never => {
    throw new ResourceContractError(key, `liveValue("${key}"): ${detail}`);
  };
  return {
    encode(query) {
      const parsed = schema.safeParse(query);
      if (!parsed.success) {
        throw new Error(
          `liveValue("${key}"): the query is refused by its schema: ` +
            parsed.error.issues
              .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
              .join("; "),
        );
      }
      const q = canonicalJson(parsed.data);
      const bytes = utf8Bytes(q);
      if (bytes > LIVE_QUERY_MAX_BYTES) {
        throw new Error(
          `liveValue("${key}"): the encoded query is ${bytes} bytes, over ` +
            `LIVE_QUERY_MAX_BYTES (${LIVE_QUERY_MAX_BYTES}) — a question that ` +
            `big is a request body, not a live tuple.`,
        );
      }
      return q;
    },
    decode(q) {
      if (utf8Bytes(q) > LIVE_QUERY_MAX_BYTES) {
        reject(`q is over LIVE_QUERY_MAX_BYTES (${LIVE_QUERY_MAX_BYTES})`);
      }
      let raw: unknown;
      try {
        raw = JSON.parse(q);
      } catch (err) {
        if (!(err instanceof SyntaxError)) throw err;
        return reject(`q is not JSON: ${err.message}`);
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        return reject(
          `q is refused by the query schema: ` +
            parsed.error.issues
              .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
              .join("; "),
        );
      }
      let canonical: string;
      try {
        canonical = canonicalJson(parsed.data);
      } catch (err) {
        // A schema whose output is not plain JSON (a transform to a Date):
        // no tuple of it is canonical.
        if (!(err instanceof Error)) throw err;
        return reject(`the query schema's output ${err.message}`);
      }
      if (canonical !== q) {
        reject(
          `q is not canonical — ${JSON.stringify(q)} decodes to ` +
            `${JSON.stringify(canonical)} (a key order, a default, or a ` +
            `schema whose parse is not idempotent)`,
        );
      }
      return parsed.data;
    },
  };
}

/** A typed-query value's codec over its schema. */
export function liveQueryCodec<Q, QIn>(
  key: string,
  schema: LiveQuerySchema<Q, QIn>,
): LiveQueryCodec<Q, QIn> {
  const codec = queryCodec(key, schema);
  return {
    encode: (query) => ({ q: codec.encode(query) }),
    decode(params) {
      for (const name of Object.keys(params)) {
        if (name !== "q") {
          throw new ResourceContractError(
            key,
            `liveValue("${key}"): unknown param "${name}" — a query value's tuple is { q }`,
          );
        }
      }
      const q = params.q;
      if (typeof q !== "string") {
        throw new ResourceContractError(
          key,
          `liveValue("${key}"): missing param "q"`,
        );
      }
      return codec.decode(q);
    },
  };
}

const PAGE_PARAMS: ReadonlySet<string> = new Set(["q", "n", "c"]);

/**
 * A paged value's codec: the question's `q`, plus `n` (an integer in
 * `1..maxLimit`, canonical decimal) and an optional `c` (non-empty, at most
 * `LIVE_PAGE_CURSOR_MAX_BYTES`).
 */
export function livePageCodec<Q, QIn>(
  key: string,
  schema: LiveQuerySchema<Q, QIn>,
  maxLimit: number,
): LivePageCodec<Q, QIn> {
  const codec = queryCodec(key, schema);
  const reject = (detail: string): never => {
    throw new ResourceContractError(key, `liveValue("${key}"): ${detail}`);
  };
  const page = (
    q: string,
    { cursor, limit }: LivePageRequest,
  ): LivePageParams => {
    if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
      throw new Error(
        `liveValue("${key}"): page size ${limit} is not an integer in 1..${maxLimit}`,
      );
    }
    if (cursor !== null && !isLivePageCursor(cursor)) {
      throw new Error(
        `liveValue("${key}"): cursor ${JSON.stringify(cursor)} is empty or over ${LIVE_PAGE_CURSOR_MAX_BYTES} bytes`,
      );
    }
    return {
      q,
      n: String(limit),
      ...(cursor !== null ? { c: cursor } : {}),
    };
  };
  return {
    encodeQuery: (query) => codec.encode(query),
    page,
    encode: (query, request) => page(codec.encode(query), request),
    decode(params) {
      for (const name of Object.keys(params)) {
        if (!PAGE_PARAMS.has(name)) {
          reject(
            `unknown param "${name}" — a paged value's tuple is { q, n, c? }`,
          );
        }
      }
      const { q, n, c } = params;
      if (typeof q !== "string") return reject(`missing param "q"`);
      if (typeof n !== "string") return reject(`missing param "n"`);
      const limit = Number(n);
      if (
        !/^[1-9][0-9]*$/.test(n) ||
        !Number.isSafeInteger(limit) ||
        limit > maxLimit
      ) {
        reject(`n = ${JSON.stringify(n)} is not an integer in 1..${maxLimit}`);
      }
      if (c !== undefined && !isLivePageCursor(c)) {
        reject(
          `c is empty or over LIVE_PAGE_CURSOR_MAX_BYTES (${LIVE_PAGE_CURSOR_MAX_BYTES})`,
        );
      }
      return { query: codec.decode(q), limit, cursor: c ?? null };
    },
  };
}

/** A cursor a page tuple can carry: non-empty, within the byte bound. */
export function isLivePageCursor(cursor: string): boolean {
  return cursor !== "" && utf8Bytes(cursor) <= LIVE_PAGE_CURSOR_MAX_BYTES;
}

const encoder = new TextEncoder();

function utf8Bytes(s: string): number {
  return encoder.encode(s).length;
}

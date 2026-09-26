import { z } from "zod";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import {
  keyedResourceDescriptor,
  type PointParams,
  type PointResourceDescriptor,
  type ResourcePreload,
  type WindowParams,
  type WindowResourceDescriptor,
  type WindowSelector,
} from "@plugins/primitives/plugins/live-state/core";

// The web-safe halves of a bounded (window / point) query-resource declaration —
// the exact twins of `QueryResourceContract`: the live-state descriptor (which
// carries the selector codec both sides share) plus `queryPk`, so the server's
// `windowQueryResource` can assert the descriptor and the derived query identity
// key on the same field (a boot-time throw on drift, not a runtime mismatch).
//
// These are the ONLY factories for window / point descriptors: live-state owns
// the descriptor TYPES and the hooks, but the only server half that can serve a
// bounded resource is `windowQueryResource`, which needs `queryPk` — so a
// codec-carrying descriptor without it would be an unservable second spelling.
//
// The selector codecs follow the bounded working-set contract
// (research/2026-07-18-global-bounded-working-set-resource-contract.md). A
// window/point subscription is just a params tuple, so the SAME logical
// selector MUST always produce the SAME params object: paramsKey identity is
// what makes boot hydration, the `useResource` subscription, and the server
// loader land on ONE per-tuple state. Both codecs are therefore canonical on
// encode and STRICT on decode (malformed params throw — fail loudly; a
// defaulting decode would let `{}` and the default window name the same
// logical window under two paramsKeys, doubling every per-tuple state).

export type WindowQueryResourceContract<
  Row,
  P extends WindowParams = WindowParams,
  S extends WindowSelector = WindowSelector,
> = WindowResourceDescriptor<Row, P, S> & {
  /** The row field the client `keyOf` reads — matched against the server keyField. */
  queryPk: string;
};

export type PointQueryResourceContract<Row> = PointResourceDescriptor<Row> & {
  /** The row field the client `keyOf` reads — matched against the server keyField. */
  queryPk: string;
};

function assertWindowLimit(limit: number, context: string): void {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error(
      `${context}: window limit must be a positive integer, got ${limit}`,
    );
  }
}

function pkKeyOf<Row>(pkField: keyof Row & string): (row: unknown) => string {
  return (row) => String((row as Record<string, unknown>)[pkField]);
}

/**
 * Declare a bounded ordered-window keyed resource whose rows are a flat SQL
 * query result. Wraps `keyedResourceDescriptor` (schema stays
 * `z.array(rowSchema)`, so `useResource` callers still get `Row[]` and the keyed
 * delta wire is unchanged), attaches the window codec + the canonical
 * `defaultParams` tuple, and records `queryPk` for the server-side drift
 * assertion. The matching server half is `windowQueryResource(descriptor, spec)`.
 */
export function windowQueryResourceDescriptor<Row>(
  key: string,
  rowSchema: ZodParser<Row>,
  pkField: keyof Row & string,
  opts: { defaultLimit: number; preload?: ResourcePreload },
): WindowQueryResourceContract<Row> {
  const { defaultLimit, ...rest } = opts;
  assertWindowLimit(defaultLimit, `windowQueryResourceDescriptor("${key}")`);

  const encode = (sel?: WindowSelector): WindowParams => {
    const limit = sel?.limit ?? defaultLimit;
    assertWindowLimit(limit, `windowQueryResourceDescriptor("${key}").encode`);
    return { limit: String(limit) };
  };
  const decode = (params: Record<string, string>): { limit: number } => {
    const raw = params.limit;
    if (raw === undefined || !/^[1-9][0-9]*$/.test(raw)) {
      throw new Error(
        `windowQueryResourceDescriptor("${key}").decode: params.limit must be a ` +
          `canonical positive-integer string, got ${JSON.stringify(raw)}`,
      );
    }
    return { limit: Number(raw) };
  };

  const d = keyedResourceDescriptor<Row[], WindowParams>(
    key,
    z.array(rowSchema),
    [],
    pkKeyOf(pkField),
    rest,
  );
  return Object.assign(d, {
    defaultParams: encode(),
    window: { defaultLimit, encode, decode },
    queryPk: pkField,
  });
}

/**
 * Declare an explicit point-set keyed resource whose rows are a flat SQL query
 * result — the `windowQueryResourceDescriptor` twin for `point: { by }` specs.
 * The id-set codec lives on the descriptor so the client hooks and the server
 * compiler share one encoding; `decode` doubles as the server membership
 * `idsOf`. Point resources are never preloaded (post-mount hydration is the
 * recorded decision — the server cannot know a client's id set at snapshot time).
 */
export function pointQueryResourceDescriptor<Row>(
  key: string,
  rowSchema: ZodParser<Row>,
  pkField: keyof Row & string,
): PointQueryResourceContract<Row> {
  const encode = (ids: readonly string[]): PointParams => {
    for (const id of ids) {
      if (id === "" || id.includes(",")) {
        throw new Error(
          `pointQueryResourceDescriptor("${key}").encode: ids must be non-empty and ` +
            `comma-free, got ${JSON.stringify(id)}`,
        );
      }
    }
    return { ids: [...new Set(ids)].sort().join(",") };
  };
  const decode = (params: Record<string, string>): string[] => {
    const raw = params.ids;
    if (raw === undefined) {
      throw new Error(
        `pointQueryResourceDescriptor("${key}").decode: params.ids is missing — a ` +
          `point subscription has no meaning without an id set`,
      );
    }
    return raw === "" ? [] : raw.split(",");
  };

  const d = keyedResourceDescriptor<Row[], PointParams>(
    key,
    z.array(rowSchema),
    [],
    pkKeyOf(pkField),
  );
  return Object.assign(d, { point: { encode, decode }, queryPk: pkField });
}

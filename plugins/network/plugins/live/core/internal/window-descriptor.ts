import { z } from "zod";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import {
  keyedResourceDescriptor,
  type PointParams,
  type ResourcePreload,
  type WindowParams,
  type WindowSelector,
} from "@plugins/primitives/plugins/live-state/core";
import type {
  PointQueryResourceContract,
  WindowQueryResourceContract,
} from "@plugins/infra/plugins/query-resource/core";

// The two factories `liveCollection` mints its bounded resources with: the
// window (`windowQueryResourceDescriptor`) and the `:rows` point sibling
// (`pointQueryResourceDescriptor`). Internal to this plugin on purpose — the
// barrel exports `liveCollection`, and a collection is the one way to declare a
// bounded resource. A second, lower-level spelling would be a way to mint a
// window or point resource without the row schema, id and filterable columns
// `serveCollection` binds to the table.
//
// Each returns a query-resource CONTRACT (`{Window,Point}QueryResourceContract`,
// declared in `query-resource/core`): the live-state descriptor (which carries
// the selector codec both sides share) plus `queryPk`, so the server's
// `windowQueryResource` — the compiler behind `serveCollection` — can assert the
// descriptor and the derived query identity key on the same field (a boot-time
// throw on drift, not a runtime mismatch). The types stay in `query-resource`
// because its server consumes them, and `query-resource` never imports
// `network/live`.
//
// The selector codecs follow the bounded working-set contract
// (research/2026-07-18-global-bounded-working-set-resource-contract.md). A
// window/point subscription is just a params tuple, so the SAME logical
// selector MUST always produce the SAME params object: paramsKey identity is
// what makes boot hydration, the client subscription (`useLive`), and the
// server loader land on ONE per-tuple state. Both codecs are therefore canonical on
// encode and STRICT on decode (malformed params throw — fail loudly; a
// defaulting decode would let `{}` and the default window name the same
// logical window under two paramsKeys, doubling every per-tuple state).
// `liveCollection` replaces the window's limit-only codec with its query codec,
// which holds the same two properties.

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
 * `z.array(rowSchema)`, so a reader still gets `Row[]` and the keyed delta wire
 * is unchanged), attaches the window codec + the canonical `defaultParams`
 * tuple, and records `queryPk` for the server-side drift assertion. The
 * matching server half is `windowQueryResource(descriptor, spec)`, which
 * `serveCollection` calls.
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
 * result — the `windowQueryResourceDescriptor` twin for `point: { by }` specs,
 * and a collection's `:rows` sibling. The id-set codec lives on the descriptor
 * so the client reads and the server compiler share one encoding; `decode`
 * doubles as the server membership `idsOf`. Point resources are never
 * preloaded (post-mount hydration is the recorded decision — the server cannot
 * know a client's id set at snapshot time).
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

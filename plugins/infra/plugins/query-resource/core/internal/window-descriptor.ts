import type { ZodType } from "zod";
import {
  pointResourceDescriptor,
  windowResourceDescriptor,
  type PointResourceDescriptor,
  type WindowResourceDescriptor,
} from "@plugins/primitives/plugins/live-state/core";

// The web-safe halves of a bounded (window / point) query-resource declaration —
// the exact twins of `QueryResourceContract`: the live-state descriptor (which
// carries the selector codec both sides share) plus `queryPk`, so the server's
// `windowQueryResource` can assert the descriptor and the derived query identity
// key on the same field (a boot-time throw on drift, not a runtime mismatch).

export type WindowQueryResourceContract<Row> = WindowResourceDescriptor<Row> & {
  /** The row field the client `keyOf` reads — matched against the server keyField. */
  queryPk: string;
};

export type PointQueryResourceContract<Row> = PointResourceDescriptor<Row> & {
  /** The row field the client `keyOf` reads — matched against the server keyField. */
  queryPk: string;
};

/**
 * Declare a bounded ordered-window keyed resource whose rows are a flat SQL
 * query result. Thin wrapper over `windowResourceDescriptor` (the payload
 * schema is `z.array(rowSchema)`, the client `keyOf` reads `pkField`), plus
 * `queryPk` for the server-side drift assertion — byte-for-byte the
 * `queryResourceDescriptor` shape.
 */
export function windowQueryResourceDescriptor<Row>(
  key: string,
  rowSchema: ZodType<Row>,
  pkField: keyof Row & string,
  opts: { defaultLimit: number; bootCritical?: true },
): WindowQueryResourceContract<Row> {
  const descriptor = windowResourceDescriptor<Row>(
    key,
    rowSchema,
    (row) => String((row as Record<string, unknown>)[pkField]),
    opts,
  );
  return Object.assign(descriptor, { queryPk: pkField });
}

/**
 * Declare an explicit point-set keyed resource whose rows are a flat SQL query
 * result — the `windowQueryResourceDescriptor` twin for `point: { by }` specs.
 */
export function pointQueryResourceDescriptor<Row>(
  key: string,
  rowSchema: ZodType<Row>,
  pkField: keyof Row & string,
): PointQueryResourceContract<Row> {
  const descriptor = pointResourceDescriptor<Row>(
    key,
    rowSchema,
    (row) => String((row as Record<string, unknown>)[pkField]),
  );
  return Object.assign(descriptor, { queryPk: pkField });
}

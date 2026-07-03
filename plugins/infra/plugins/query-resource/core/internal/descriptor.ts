import { z } from "zod";
import type { ZodType } from "zod";
import {
  keyedResourceDescriptor,
  type ResourceDescriptor,
} from "@plugins/primitives/plugins/live-state/core";

// The web-safe half of a query-resource declaration. It is exactly a keyed
// `ResourceDescriptor` over `Row[]` (so the client keeps its `keyOf` and every
// `useResource` caller still gets `T[]`), plus one extra field — `queryPk` —
// recording WHICH row field the identity keys on. The server's `queryResource`
// asserts that `queryPk` equals the keyField it derives from the drizzle query,
// so a descriptor and its server query can never silently key on different
// columns (a boot-time throw on drift, not a runtime mismatch).
//
// NO drizzle imports live under `core/`: this file is bundled into the browser,
// so it may only reference the (web-safe) live-state descriptor + zod.
export type QueryResourceContract<
  Row,
  P extends Record<string, string> = Record<string, never>,
> = ResourceDescriptor<Row[], P> & {
  keyed: { keyOf: (row: unknown) => string };
  /** The row field the client `keyOf` reads — matched against the server keyField. */
  queryPk: string;
};

/**
 * Declare a keyed live-state resource whose rows are a flat SQL query result.
 * A thin wrapper over `keyedResourceDescriptor`: the payload schema is
 * `z.array(rowSchema)`, the initial data is `[]`, and the client `keyOf` reads
 * `pkField` off each row. The returned contract additionally carries `queryPk`
 * (= `pkField`) so the server's `queryResource(descriptor, spec)` can assert the
 * descriptor and the derived query identity agree.
 *
 * `pkField` is the JS property the identity column is exposed under on the wire —
 * for an aliased projection (`select: { conversationId: table.parentId }`) that
 * is the alias (`"conversationId"`), not the DB column name.
 */
export function queryResourceDescriptor<
  Row,
  P extends Record<string, string> = Record<string, never>,
>(
  key: string,
  rowSchema: ZodType<Row>,
  pkField: keyof Row & string,
  opts?: { bootCritical?: true },
): QueryResourceContract<Row, P> {
  const descriptor = keyedResourceDescriptor<Row[], P>(
    key,
    z.array(rowSchema),
    [],
    (row) => String((row as Record<string, unknown>)[pkField]),
    opts,
  );
  return Object.assign(descriptor, { queryPk: pkField });
}

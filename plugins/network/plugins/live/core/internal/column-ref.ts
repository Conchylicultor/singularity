import type { FilterDomainId } from "@plugins/network/plugins/live/plugins/filter/core";
import type { LiveColumnsDeclaration } from "./live-columns";

// The mark `mintColumnRef` puts on a ref. Module-private, so no code outside
// this file can write the property — a ref literal is a tsc error.
declare const MINTED: unique symbol;

/** The fields of a column ref, before it is minted (see `mintColumnRef`). */
interface ColumnRefFields {
  /** Its collection's key — `null` for a scoped set's member, which names its `scope` instead. */
  readonly collection: string | null;
  /** A scoped member's scope (the collection's `columnScope` it binds under); `null` otherwise. */
  readonly scope: string | null;
  /** The column's wire name (a contributed column's is `<contributor>.<field>`). */
  readonly name: string;
  readonly domain: FilterDomainId | null;
  readonly sortable: boolean;
  /** The contributed-column handle that declared it; absent for the collection's own column. */
  readonly handle?: LiveColumnsDeclaration;
}

/**
 * One column of a collection as a list binds a field to it: its wire name, the
 * filter domain it takes (`null` when it is not filterable) and whether it
 * sorts. Minted only by `c.column(name)` (or a contributed / scoped handle's
 * `.column()`) — a brand only `mintColumnRef` sets, so a hand-written literal,
 * whose `domain` / `sortable` nothing checked, is a tsc error — typed to the
 * declared filterable ∪ sortable names, and carrying its collection's key as
 * data, so a surface reading another collection can tell (a DataView asserts
 * it at mount).
 */
export interface LiveColumnRef extends ColumnRefFields {
  readonly [MINTED]: true;
}

/** Mint a column ref — for the declarations in this folder only (not on the barrel). */
export function mintColumnRef(fields: ColumnRefFields): LiveColumnRef {
  return fields as LiveColumnRef;
}

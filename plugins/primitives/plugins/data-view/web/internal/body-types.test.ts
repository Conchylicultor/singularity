/**
 * The DataView data origin is a UNION, so a stand-in cannot be spelled — on
 * `DataViewProps`, and through the `MergedDataView` path's
 * `DataViewSourceBundle` (a plain `Omit` would have merged the arms back into
 * one object type). Checked by tsc (`./singularity check type-check`): each
 * `Rejects<…>` must compute `true`, so a spelling that became legal is a type
 * error here. Written as type-level assignability, not object literals, so no
 * formatting can move an expect-error off its line.
 *
 * Run: `./singularity test plugins/primitives/plugins/data-view`.
 */

import { describe, expect, test } from "bun:test";
import type {
  LiveCollection,
  LiveScrollCollection,
} from "@plugins/network/plugins/live/core";
import type {
  DataViewId,
  DataViewProps,
  FieldDef,
  HierarchyConfig,
  LiveDataSource,
  ManualOrderConfig,
  ServerDataSourceSpec,
} from "../../core";
import type { ResourceReadiness } from "@plugins/primitives/plugins/live-state/core";
import type { DataViewSourceBundle } from "./body-types";

interface Thread {
  id: string;
  subject: string;
}
interface Other {
  key: number;
}

/** `true` when `A` is NOT assignable to `B`. */
type Rejects<A, B> = [A] extends [B] ? false : true;
/** `true` when `A` IS assignable to `B`. */
type Accepts<A, B> = [A] extends [B] ? true : false;

type Base = { fields: FieldDef<Thread>[]; storageKey: DataViewId };
type Source = LiveDataSource<Thread>;
type Spec = ServerDataSourceSpec<Thread>;
type RowKey = (row: Thread, index: number) => string;
type Props = DataViewProps<Thread>;
type Bundle = DataViewSourceBundle<Thread>;

// Each origin, alone, is accepted.
const inMemory: Accepts<Base & { rows: Thread[]; rowKey: RowKey }, Props> =
  true;
const fetchPage: Accepts<Base & { dataSource: Spec; rowKey: RowKey }, Props> =
  true;
const live: Accepts<Base & { source: Source }, Props> = true;
const liveBundle: Accepts<
  Omit<Base, "storageKey"> & { source: Source },
  Bundle
> = true;

// Stand-ins beside a server origin.
const rowsBesideFetchPage: Rejects<
  Base & { dataSource: Spec; rowKey: RowKey; rows: Thread[] },
  Props
> = true;
const readinessBesideFetchPage: Rejects<
  Base & { dataSource: Spec; rowKey: RowKey; readiness: ResourceReadiness },
  Props
> = true;
const rowsBesideSource: Rejects<
  Base & { source: Source; rows: Thread[] },
  Props
> = true;
const readinessBesideSource: Rejects<
  Base & { source: Source; readiness: ResourceReadiness },
  Props
> = true;
const twoOrigins: Rejects<
  Base & { source: Source; dataSource: Spec; rowKey: RowKey },
  Props
> = true;

// What a live source refuses: its row key is its collection's id, a tree over
// a paged set orphans children, a rank would reorder server-sorted segments,
// and search is the source's `searchable`.
const rowKeyOnLive: Rejects<Base & { source: Source; rowKey: RowKey }, Props> =
  true;
const hierarchyOnLive: Rejects<
  Base & { source: Source; hierarchy: HierarchyConfig<Thread> },
  Props
> = true;
const manualOrderOnLive: Rejects<
  Base & { source: Source; manualOrder: ManualOrderConfig<Thread> },
  Props
> = true;
const searchAccessorOnLive: Rejects<
  Base & { source: Source; searchAccessor: (row: Thread) => string },
  Props
> = true;

// The same, through the MergedDataView bundle (distributive, not a merged Omit).
const bundleSourceRows: Rejects<
  Omit<Base, "storageKey"> & { source: Source; rows: Thread[] },
  Bundle
> = true;
const bundleSourceRowKey: Rejects<
  Omit<Base, "storageKey"> & { source: Source; rowKey: RowKey },
  Bundle
> = true;

// A source's rows are its collection's: a DataView over another row type
// cannot take it.
const otherRows: Rejects<Source, LiveDataSource<Other>> = true;

// `liveDataSource` takes only a collection declared `scroll: true`.
type Plain = LiveCollection<Thread, { subject: never }, "subject">;
const plainIsNotScroll: Rejects<
  Plain,
  LiveScrollCollection<Thread, { subject: never }, "subject">
> = true;

describe("DataView data origin (type-level)", () => {
  test("every stand-in is rejected, every lone origin accepted", () => {
    // The assertions are the type annotations above; this keeps them used.
    expect(
      [
        inMemory,
        fetchPage,
        live,
        liveBundle,
        rowsBesideFetchPage,
        readinessBesideFetchPage,
        rowsBesideSource,
        readinessBesideSource,
        twoOrigins,
        rowKeyOnLive,
        hierarchyOnLive,
        manualOrderOnLive,
        searchAccessorOnLive,
        bundleSourceRows,
        bundleSourceRowKey,
        otherRows,
        plainIsNotScroll,
      ].every(Boolean),
    ).toBe(true);
  });
});

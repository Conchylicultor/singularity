import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { ComponentType, ReactNode } from "react";
import type { ViewTypeMeta } from "@plugins/primitives/plugins/data-view/plugins/view-core/core";
import type { LoadingVariant } from "@plugins/primitives/plugins/loading/web";
import type {
  DataViewId,
  DataViewRenderProps,
  ManualOrderConfig,
} from "../core";
import type { DataViewSettingsContextValue } from "./components/settings/settings-context";
import { defineFieldExtensions } from "./internal/field-extensions";
import { Cell } from "./cell-slot";
import { CellEditor } from "./cell-editor-slot";
import { Filter } from "./filter-slot";
import { ValueCodec } from "./value-codec-slot";
import { ColumnConfig } from "./column-config-slot";

/**
 * A registered view-*type*: the generic `ViewTypeMeta` (type/title/icon/order/
 * hierarchical/configSchema — owned by view-core) plus data-view's own render
 * contract, the `component`.
 */
export interface DataViewContribution extends ViewTypeMeta {
  component: ComponentType<DataViewRenderProps<unknown>>;
  /** Whether this view honors `ViewState.sort` (flat field sort). Default true;
   *  a view sets false when it has no meaningful field-sort axis, and the host
   *  hides the Sort pill for it. The tree honors sort by ordering each sibling
   *  group by the field (defaulting to manual/rank order), so it stays true. */
  supportsSort?: boolean;
  /** Skeleton shape the host renders while this view is loading (the host owns
   *  the loading→empty precedence so view children never see a loading state).
   *  Default "rows"; gallery declares "cards". */
  loadingVariant?: LoadingVariant;
  /** Skeleton item count for the loading variant (forwarded to <Loading count>). */
  loadingCount?: number;
  /** Whether this view supports group-by sections. Default true; the tree view
   *  sets false (it orders by hierarchy, not a flat field) — so the host hides
   *  the group-by control for it. Mirrors `supportsSort`. */
  supportsGroupBy?: boolean;
  /** Whether this view supports flat manual-order (rank-based drag reorder).
   *  Default **false** (unlike `supportsSort`/`supportsGroupBy`): the flat views
   *  list/table opt IN (`true`); gallery/tree do not. When false the host never
   *  passes `manualOrder` into the view and keeps the Sort control. */
  supportsManualOrder?: boolean;
}

/**
 * A contribution to the DataView settings menu (the gear popover). A plain data
 * contribution (NOT a render slot — settings aren't force-reorderable), mirroring
 * the `View` slot's shape. `scope` places it in the "Current view" section
 * (per-instance settings like group-by / properties) or the "DataView" section
 * (surface-wide settings like custom-columns). The `component` reads everything it
 * needs from `DataViewSettingsContext` — no props are threaded.
 */
export interface DataViewSettingContribution {
  /** Stable id (React key + reorder/doc identity). */
  id: string;
  /** Which menu section this setting renders in. */
  scope: "global" | "view";
  /** Ordering within its scope's section (ascending; default 0). */
  order?: number;
  /**
   * Whether this setting has anything to render for the current context — the
   * generic applicability signal the menu uses to decide gear/section visibility
   * without ever naming a specific contribution (group-by hides when no field is
   * groupable, properties hides on a single-field surface). Must mirror the
   * component's own self-hide so an "applicable" setting always renders. Absent =
   * always applicable.
   */
  isApplicable?: (ctx: DataViewSettingsContextValue) => boolean;
  component: ComponentType;
}

/**
 * Props a **global** row-order contribution receives. The twin of the global
 * `FieldExtension` slot's props: a single always-on slot every eligible DataView
 * folds, so the host threads the surface coordinates a contributor needs to key
 * a per-view-instance row order — the `storageKey` (which surface), the
 * `viewId` (which view instance owns this order), and `rowKey` (how to identify
 * a row). The row type is erased to `unknown` (a global slot spans disjoint
 * consumer row types).
 *
 * `rows` is the view's **ordered set**: filter-applied, search-EXCLUDED,
 * sort-suppressed. Search only affects what is *rendered*, never which rows the
 * order covers — so a drag under an active search still rebuilds the full order
 * and no hidden row is dropped.
 */
export interface GlobalRowOrderProps {
  storageKey: DataViewId;
  /** The ACTIVE view-instance id — the order's scope. */
  viewId: string;
  rowKey: (row: unknown, index: number) => string;
  /** The view's ordered set: filter-applied, search-EXCLUDED, sort-suppressed. */
  rows: readonly unknown[];
  /** Hand the host this contributor's order, or `null` to defer to the next
   *  contributor (called in render — the component is mounted, so it may load
   *  hook-backed data first). */
  render: (order: ManualOrderConfig<unknown> | null) => ReactNode;
}

export interface GlobalRowOrderContribution {
  /** Stable id (React key + reorder/doc identity). */
  id: string;
  component: ComponentType<GlobalRowOrderProps>;
  order?: number;
}

export const DataViewSlots = {
  View: defineSlot<DataViewContribution>("primitives.data-view.view", {
    docLabel: (p) => p.title,
  }),
  /**
   * Global, always-on field-extension slot: the global-registered instance of the
   * same `defineFieldExtensions` factory (minted at `<unknown>`, since a global
   * slot spans disjoint consumer row types). Every DataView folds its
   * contributions into the schema (before the sort/filter controllers), threading
   * `{ storageKey, rowKey }` so a contributor can key its per-row `FieldDef.value`
   * over the surface. This is the cross-plugin, always-on case of field extensions
   * — used by custom-columns to add every surface's user-defined columns without
   * the host importing it — as opposed to the per-consumer `fieldExtensions` prop
   * (Sonata's typed/scoped fields). Both share one contribution shape and one fold.
   */
  FieldExtension: defineFieldExtensions<unknown>(
    "primitives.data-view.field-extension",
  ),
  /**
   * Global, always-on row-order slot: every DataView eligible for a manual order
   * (list/table, no consumer `manualOrder`, no `dataSource`/`aggregate`/group-by)
   * folds its contributions, threading `{ storageKey, viewId, rowKey, rows }` so
   * a contributor can key a per-view-instance drag order over the surface.
   * **First non-null wins** (the fold order is a committed reorder override), and
   * a consumer-supplied `DataViewProps.manualOrder` still outranks every
   * contributor.
   */
  RowOrder: defineRenderSlot<GlobalRowOrderContribution>(
    "primitives.data-view.row-order",
    { docLabel: (p) => p.id },
  ),
  /** Contributable DataView settings menu entries (group-by, future per-view /
   *  surface-wide settings). Plain data slot, read by the host's settings menu. */
  Setting: defineSlot<DataViewSettingContribution>("primitives.data-view.setting", {
    docLabel: (p) => p.id,
  }),
  /** Per-type table cell. Contribute `{ match, component }`. */
  Cell,
  /** Per-type inline cell editor. Contribute `{ match, component }`. */
  CellEditor,
  /** Per-type filter. Contribute one `FilterOperatorSet` ({ match, operators, defaultOperator? }). */
  Filter,
  /** Per-type native↔text value codec for custom columns. Contribute `{ match, codec }`. */
  ValueCodec,
  /** Per-type add-time custom-column config editor. Contribute `{ match, component }`. */
  ColumnConfig,
};

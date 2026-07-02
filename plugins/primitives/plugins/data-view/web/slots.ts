import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { ComponentType, ReactNode } from "react";
import type { ViewTypeMeta } from "@plugins/primitives/plugins/data-view/plugins/view-core/core";
import type { LoadingVariant } from "@plugins/primitives/plugins/loading/web";
import type { DataViewId, DataViewRenderProps, FieldDef } from "../core";
import type { DataViewSettingsContextValue } from "./components/settings/settings-context";
import { Cell } from "./cell-slot";
import { CellEditor } from "./cell-editor-slot";
import { Filter } from "./filter-slot";

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
 * Props a **global** field-extension contribution receives. Unlike the
 * per-consumer `FieldExtensionProps<TRow>` (minted by `defineFieldExtensions`,
 * passed as a prop, `{ render }`-only), this is a single always-on slot every
 * DataView folds — so the host threads the surface coordinates the contributor
 * needs to key its per-row data: the `storageKey` (which surface) and `rowKey`
 * (how to identify a row). The row type is erased to `unknown` (a global slot
 * spans disjoint consumer row types), so `rowKey` is `(row: unknown, index) =>
 * string` and the yielded fields are `FieldDef<unknown>[]`.
 */
export interface GlobalFieldExtensionProps {
  storageKey: DataViewId;
  rowKey: (row: unknown, index: number) => string;
  /** Hand the host this contributor's extra fields (called in render — the
   *  component is mounted, so it may load hook-backed data first). */
  render: (fields: FieldDef<unknown>[]) => ReactNode;
}

export interface GlobalFieldExtensionContribution {
  /** Stable id (React key + reorder/doc identity). */
  id: string;
  component: ComponentType<GlobalFieldExtensionProps>;
  order?: number;
}

export const DataViewSlots = {
  View: defineSlot<DataViewContribution>("primitives.data-view.view", {
    docLabel: (p) => p.title,
  }),
  /**
   * Global, always-on field-extension slot: every DataView folds its
   * contributions into the schema (before the sort/filter controllers), threading
   * `{ storageKey, rowKey }` so a contributor can key its per-row `FieldDef.value`
   * over the surface. The cross-plugin twin of the per-consumer
   * `defineFieldExtensions` factory — used by custom-columns to add every
   * surface's user-defined columns without the host importing it.
   */
  FieldExtension: defineRenderSlot<GlobalFieldExtensionContribution>(
    "primitives.data-view.field-extension",
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
};

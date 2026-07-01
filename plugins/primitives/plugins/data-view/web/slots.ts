import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType } from "react";
import type { ViewTypeMeta } from "@plugins/primitives/plugins/data-view/plugins/view-core/core";
import type { LoadingVariant } from "@plugins/primitives/plugins/loading/web";
import type { DataViewRenderProps } from "../core";
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
}

export const DataViewSlots = {
  View: defineSlot<DataViewContribution>("primitives.data-view.view", {
    docLabel: (p) => p.title,
  }),
  /** Per-type table cell. Contribute `{ match, component }`. */
  Cell,
  /** Per-type inline cell editor. Contribute `{ match, component }`. */
  CellEditor,
  /** Per-type filter. Contribute one `FilterOperatorSet` ({ match, operators, defaultOperator? }). */
  Filter,
};

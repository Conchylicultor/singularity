import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { DataViewSlots } from "@plugins/primitives/plugins/data-view/web";
import { RowOrderContribution } from "./components/row-order-contribution";

export { useRowOrder, useSetRowOrder } from "./internal/use-row-order";
export type { RowOrderState } from "./internal/use-row-order";

export default {
  description:
    "Per-view-instance manual row order for any DataView: subscribes to the persisted (dataViewId, viewId) ranks, synthesizes a total order, and contributes the resulting ManualOrderConfig back through data-view's global RowOrder slot.",
  // view-order imports data-view's barrel (a legal child→parent edge) and
  // contributes itself into the global RowOrder slot — the host names no
  // individual contributor, exactly like custom-columns' FieldExtension.
  contributions: [
    DataViewSlots.RowOrder({
      id: "view-order",
      component: RowOrderContribution,
    }),
  ],
} satisfies PluginDefinition;

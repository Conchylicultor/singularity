import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { setRowOrder } from "../core";
import { handleSetRowOrder } from "./internal/handle-set-row-order";
import { rowOrderLiveResource } from "./internal/resource";

export { _dataViewRowOrder } from "./internal/tables";
export { rowOrderLiveResource } from "./internal/resource";
export { applyRowOrder } from "./internal/handle-set-row-order";

export default {
  description:
    "Persists a per-view-instance manual row order keyed by (dataViewId, viewId, rowKey): a generic DB table, a push live resource, and a full-replace reorder endpoint that regenerates dense ranks and self-GCs the rows that left the view's ordered set.",
  httpRoutes: {
    [setRowOrder.route]: handleSetRowOrder,
  },
  contributions: [Resource.Declare(rowOrderLiveResource)],
} satisfies ServerPluginDefinition;

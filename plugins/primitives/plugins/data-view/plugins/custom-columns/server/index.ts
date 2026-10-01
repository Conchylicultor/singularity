import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { setCustomColumnValue, deleteCustomColumnValues } from "../core";
import { handleSetCustomColumnValue } from "./internal/handle-set-custom-column-value";
import { handleDeleteCustomColumnValues } from "./internal/handle-delete-custom-column-values";
import { customColumnValuesServed } from "./internal/resource";
import { customColumnsQueryAugmentor } from "./internal/query-augmentor";
import {
  customColumnDefsServed,
  customColumnsScoped,
  watchScopedDefinitions,
} from "./internal/scoped-columns";

export { _dataViewCustomValues } from "./internal/tables";

export default {
  description:
    "Persists per-row custom-column values keyed by (dataViewId, rowKey, columnId): a generic DB table, a push live resource, and an upsert/delete-on-empty endpoint.",
  httpRoutes: {
    [setCustomColumnValue.route]: handleSetCustomColumnValue,
    [deleteCustomColumnValues.route]: handleDeleteCustomColumnValues,
  },
  contributions: [
    ...customColumnValuesServed.declare,
    ...customColumnDefsServed.declare,
    customColumnsQueryAugmentor,
    customColumnsScoped,
  ],
  // The surfaces a live collection is scoped to were collected at bind; the
  // config registry is up by now.
  onReady() {
    watchScopedDefinitions();
  },
} satisfies ServerPluginDefinition;

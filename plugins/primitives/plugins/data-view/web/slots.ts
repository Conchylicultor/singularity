import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType } from "react";
import type { FieldsRecord } from "@plugins/config_v2/core";
import type { DataViewRenderProps } from "../core";
import { Cell } from "./cell-slot";
import { CellEditor } from "./cell-editor-slot";
import { Filter } from "./filter-slot";

export interface DataViewContribution {
  /** Registry id of this view-type (e.g. "table", "gallery"). Instances
   *  reference it via ViewInstance.type. */
  type: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  order?: number;
  /** This view requires `DataViewProps.hierarchy`; the host drops it when absent. */
  hierarchical?: boolean;
  /** ST3: per-instance `options` sub-form schema, type-dispatched by `type`.
   *  Declared here to fix the contribution shape; unused in ST2. */
  configSchema?: FieldsRecord;
  component: ComponentType<DataViewRenderProps<unknown>>;
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

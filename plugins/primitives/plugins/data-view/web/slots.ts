import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType } from "react";
import type { DataViewRenderProps } from "../core";
import { Cell } from "./cell-slot";
import { Filter } from "./filter-slot";

export interface DataViewContribution {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  order?: number;
  component: ComponentType<DataViewRenderProps<unknown>>;
}

export const DataViewSlots = {
  View: defineSlot<DataViewContribution>("primitives.data-view.view", {
    docLabel: (p) => p.title,
  }),
  /** Per-type table cell. Contribute `{ match, component }`. */
  Cell,
  /** Per-type filter. Contribute `{ match, Control, predicate, isActive }`. */
  Filter,
};

import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdViewList } from "react-icons/md";
import { DataViewSlots } from "@plugins/primitives/plugins/data-view/web";
import { ListView } from "./components/list-view";

export type { ListViewOptions } from "../core";

export default {
  description:
    "List view child for the data-view primitive: a compact single-row-per-item list (Row primitive) with field-driven label/subtitle/trailing, active-row highlight, and hover item actions.",
  contributions: [
    DataViewSlots.View({
      type: "list",
      title: "List",
      icon: MdViewList,
      order: 3,
      loadingVariant: "rows",
      component: ListView,
      // Opts into flat manual-order (rank-based drag reorder); active only when
      // the consumer supplies `manualOrder`.
      supportsManualOrder: true,
    }),
  ],
} satisfies PluginDefinition;

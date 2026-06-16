import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { DataViewSlots } from "@plugins/primitives/plugins/data-view/web";
import { MdTableRows } from "react-icons/md";
import { TableView } from "./components/table-view";

export type { TableViewOptions } from "../core";

export default {
  description:
    "Table view for data-view: maps the typed field schema to data-table columns with host-controlled sort.",
  contributions: [
    DataViewSlots.View({
      type: "table",
      title: "Table",
      icon: MdTableRows,
      order: 1,
      component: TableView,
    }),
  ],
} satisfies PluginDefinition;

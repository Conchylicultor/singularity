import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdLibraryBooks } from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { Studio } from "@plugins/apps/plugins/studio/plugins/shell/web";
import { contributionsPane } from "./panes";

export default {
  description: "Central view of all plugin contributions aggregated by type.",
  contributions: [
    Pane.Register({ pane: contributionsPane }),
    Studio.Sidebar({
      id: "contributions",
      title: "Contributions",
      icon: MdLibraryBooks,
      onClick: () => openPane(contributionsPane, {}, { mode: "root" }),
    }),
  ],
  slots: { contributions: contributionsPane },
} satisfies PluginDefinition;

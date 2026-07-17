import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdLayers } from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Studio } from "@plugins/apps/plugins/studio/plugins/shell/web";
import { compositionsPane, compositionDetailPane, comparePane } from "./panes";
import {
  CompositionItemActions,
  DeleteAction,
} from "./components/composition-item-actions";

export { CompositionDetail } from "./slots";
export { compositionsPane, compositionDetailPane, comparePane } from "./panes";

export default {
  description:
    "Compositions pane: list named compositions and open a composition's detail pane, whose sections (draft, closure, release) are contributed by sub-plugins.",
  contributions: [
    Pane.Register({ pane: compositionsPane }),
    Pane.Register({ pane: compositionDetailPane }),
    Pane.Register({ pane: comparePane }),
    CompositionItemActions({ id: "delete", component: DeleteAction }),
    Studio.Sidebar({
      id: "compositions",
      ...sidebarNavItem({
        title: "Compositions",
        icon: MdLayers,
        onClick: () => openPane(compositionsPane, {}, { mode: "root" }),
      }),
    }),
  ],
} satisfies PluginDefinition;

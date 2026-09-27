import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pages } from "@plugins/apps/plugins/pages/plugins/shell/web";
import { PagesTrash } from "./components/pages-trash";
import { symbol } from "@plugins/ui/plugins/icons/core";

export default {
  description:
    "Pages trash consumer: contributes a Trash entry into the Pages sidebar, opening a dialog that lists soft-deleted pages with restore and permanent-delete actions.",
  contributions: [
    Pages.Sidebar({
      id: "trash",
      title: "Trash",
      icon: symbol("delete"),
      component: PagesTrash,
    }),
  ],
} satisfies PluginDefinition;

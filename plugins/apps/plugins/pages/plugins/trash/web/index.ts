import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdDeleteOutline } from "react-icons/md";
import { Pages } from "@plugins/apps/plugins/pages/plugins/shell/web";
import { PagesTrash } from "./components/pages-trash";

export default {
  description:
    "Pages trash consumer: contributes a Trash entry into the Pages sidebar, opening a dialog that lists soft-deleted pages with restore and permanent-delete actions.",
  contributions: [
    Pages.Sidebar({
      id: "trash",
      title: "Trash",
      icon: MdDeleteOutline,
      component: PagesTrash,
    }),
  ],
} satisfies PluginDefinition;

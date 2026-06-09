import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { BellButton } from "./components/bell-button";

export { toast, type ToastArgs } from "./internal/toast";
export { notificationsResource } from "../shared/resources";

export default {
  description: "Persistent bell-button notifications backed by the DB.",
  contributions: [
    ActionBar.Item({
      id: "notifications",
      component: BellButton,
    }),
  ],
} satisfies PluginDefinition;

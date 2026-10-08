import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { BellButton } from "./components/bell-button";
import { IdKinds } from "@plugins/ids/web";
import { notificationIdKind } from "../core";

export { toast, type ToastArgs } from "./internal/toast";

export default {
  description: "Persistent bell-button notifications backed by the DB.",
  contributions: [
    IdKinds.Kind({ kind: notificationIdKind }),
    ActionBar.Item({
      id: "notifications",
      component: BellButton,
    }),
  ],
} satisfies PluginDefinition;

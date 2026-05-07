import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web";
import { BellButton } from "./components/bell-button";

export default {
  id: "notifications",
  name: "Notifications",
  description: "Persistent bell-button notifications backed by the DB.",
  contributions: [
    Shell.Toolbar({
      id: "notifications",
      component: BellButton,
      group: "actions",
    }),
  ],
} satisfies PluginDefinition;

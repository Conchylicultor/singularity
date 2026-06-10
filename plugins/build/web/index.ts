import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { ConfigV2 } from "@plugins/config_v2/web";
import { buildConfig } from "../shared/config";
import { BuildButton } from "./components/build-button";
import { buildPane, buildDetailPane } from "./panes";

export { BuildDetail as BuildDetailSlots } from "./slots";
export { buildPane, buildDetailPane } from "./panes";
export { useStaleFrontend } from "./hooks/use-stale-frontend";

export default {
  collapsed: true,
  description: "Trigger `./singularity build` from the toolbar.",
  contributions: [
    ActionBar.Item({
      id: "build",
      component: BuildButton,
    }),
    Pane.Register({ pane: buildPane }),
    Pane.Register({ pane: buildDetailPane }),
    ConfigV2.WebRegister({ descriptor: buildConfig }),
  ],
} satisfies PluginDefinition;

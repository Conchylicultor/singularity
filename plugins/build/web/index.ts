import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web";
import { Config } from "@plugins/config/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { buildConfig } from "../shared/config";
import { BuildButton } from "./components/build-button";
import { buildPane } from "./panes";

export default {
  id: "build",
  name: "Build",
  description: "Trigger `./singularity build` from the toolbar.",
  contributions: [
    Shell.Toolbar({
      id: "build",
      component: BuildButton,
      group: "actions",
    }),
    Config.Spec(buildConfig),
    Pane.Register({ pane: buildPane }),
  ],
} satisfies PluginDefinition;

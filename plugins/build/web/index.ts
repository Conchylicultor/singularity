import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web";
import { Config } from "@plugins/config/web";
import { buildConfig } from "../shared/config";
import { BuildButton } from "./components/build-button";

export default {
  id: "build",
  name: "Build",
  description: "Trigger `./singularity build` from the toolbar.",
  contributions: [
    Shell.Toolbar({
      component: BuildButton,
      group: "actions",
    }),
    Config.Spec(buildConfig),
  ],
} satisfies PluginDefinition;

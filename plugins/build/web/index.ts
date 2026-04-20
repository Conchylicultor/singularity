import type { PluginDefinition } from "@core";
import { Shell as ShellSlots } from "@plugins/shell/web/slots";
import { Config } from "@plugins/config/web/slots";
import { buildConfig } from "../shared/config";
import { BuildButton } from "./components/build-button";

const buildPlugin: PluginDefinition = {
  id: "build",
  name: "Build",
  description: "Trigger `./singularity build` from the toolbar.",
  contributions: [
    ShellSlots.Toolbar({
      component: BuildButton,
      group: "actions",
    }),
    Config.Spec(buildConfig),
  ],
};

export default buildPlugin;

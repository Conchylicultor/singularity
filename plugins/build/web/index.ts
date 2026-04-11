import type { PluginDefinition } from "@core";
import { Shell as ShellSlots } from "@plugins/shell/web/slots";
import { BuildButton } from "./components/build-button";

const buildPlugin: PluginDefinition = {
  id: "build",
  name: "Build",
  contributions: [
    ShellSlots.Toolbar({
      component: BuildButton,
      group: "actions",
    }),
  ],
};

export default buildPlugin;

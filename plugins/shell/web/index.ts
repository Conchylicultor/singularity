import { Core, type PluginDefinition } from "@core";
import { ShellLayout } from "./components/shell-layout";

const shellPlugin: PluginDefinition = {
  id: "shell",
  name: "Shell",
  contributions: [Core.Root({ component: ShellLayout })],
};

export default shellPlugin;

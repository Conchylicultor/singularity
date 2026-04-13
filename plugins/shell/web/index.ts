import { Core, type PluginDefinition } from "@core";
import { ShellLayout } from "./components/shell-layout";

const shellPlugin: PluginDefinition = {
  id: "shell",
  name: "Shell",
  description: "Foundational app layout; defines the slots and commands most other plugins extend.",
  contributions: [Core.Root({ component: ShellLayout })],
};

export default shellPlugin;

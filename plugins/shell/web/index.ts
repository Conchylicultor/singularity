import { Core, type PluginDefinition } from "@core";
import { ShellLayout } from "./components/shell-layout";
export { Shell } from "./slots";
export { Shell as ShellCommands, type ToastVariant, type ToastArgs } from "./commands";

export default {
  id: "shell",
  name: "Shell",
  description: "Foundational app layout; defines the slots and commands most other plugins extend.",
  loadBearing: true,
  contributions: [Core.Root({ component: ShellLayout })],
} satisfies PluginDefinition;

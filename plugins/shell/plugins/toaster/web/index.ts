import { Core, type PluginDefinition } from "@core";
import { ToasterRoot } from "./components/toaster-root";

export default {
  id: "shell-toaster",
  name: "Shell: Toaster",
  description:
    "Global toast notifications. Mounts the sonner Toaster and handles Shell.Toast commands.",
  contributions: [Core.Root({ component: ToasterRoot })],
} satisfies PluginDefinition;

import { Core, type PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ToasterRoot } from "./components/toaster-root";

export default {
  name: "Shell: Toaster",
  description:
    "Global toast notifications. Mounts the sonner Toaster and handles Shell.Toast commands.",
  contributions: [Core.Root({ component: ToasterRoot })],
} satisfies PluginDefinition;

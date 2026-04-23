import type { PluginDefinition } from "@core";
import "./panes";

export { welcomePane } from "./panes";

export default {
  id: "welcome",
  name: "Welcome",
  description: "Landing pane shown at `/`.",
  contributions: [],
} satisfies PluginDefinition;

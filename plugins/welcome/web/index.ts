import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web";
import { welcomePane } from "./views";

export default {
  id: "welcome",
  name: "Welcome",
  description: "Landing pane shown at `/`.",
  contributions: [
    Shell.Route({
      pattern: "/",
      resolve: () => welcomePane(),
    }),
  ],
} satisfies PluginDefinition;

import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { welcomePane } from "./views";

const welcomePlugin: PluginDefinition = {
  id: "welcome",
  name: "Welcome",
  contributions: [
    Shell.Route({
      pattern: "/",
      resolve: () => welcomePane(),
    }),
  ],
};

export default welcomePlugin;

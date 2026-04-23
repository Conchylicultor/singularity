import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/pane/web";
import { WelcomeView } from "./components/welcome-view";

export const welcomePane = Pane.define({
  id: "welcome",
  path: "/",
  component: WelcomeView,
});

export default {
  id: "welcome",
  name: "Welcome",
  description: "Landing pane shown at `/`.",
  contributions: [],
} satisfies PluginDefinition;

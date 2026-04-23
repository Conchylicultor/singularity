import { Pane } from "@plugins/pane/web";
import { WelcomeView } from "./components/welcome-view";

export const welcomePane = Pane.define({
  id: "welcome",
  path: "/",
  component: WelcomeView,
});

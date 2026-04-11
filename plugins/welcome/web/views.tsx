import type { PaneDescriptor } from "@plugins/shell/web/commands";
import { WelcomeView } from "./components/welcome-view";

export function welcomePane(): PaneDescriptor {
  return { title: "Welcome", component: WelcomeView, path: "/" };
}

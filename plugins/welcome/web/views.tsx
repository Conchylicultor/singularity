import type { PaneDescriptor } from "@plugins/shell/web";
import { WelcomeView } from "./components/welcome-view";

export function welcomePane(): PaneDescriptor {
  return { title: "Welcome", component: WelcomeView, path: "/" };
}

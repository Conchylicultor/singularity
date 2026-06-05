import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { WelcomeView } from "./components/welcome-view";

export const welcomePane = Pane.define({
  id: "welcome",
  segment: "/",
  // Index/landing pane for the agent-manager app (`Apps.App` path "/"). Scoping
  // it stops welcome being a global fallback that bleeds into every other app.
  appPath: "/",
  component: WelcomeBody,
});

function WelcomeBody() {
  return (
    <PaneChrome pane={welcomePane} title="Welcome">
      <WelcomeView />
    </PaneChrome>
  );
}

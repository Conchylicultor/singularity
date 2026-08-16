import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { WelcomeView } from "./components/welcome-view";

export const welcomePane = Pane.define({
  id: "welcome",
  app: agentManagerApp,
  segment: "/",
  // Index/landing pane for the agent-manager app (`Apps.App` path "/agents"). Scoping
  // it stops welcome being a global fallback that bleeds into every other app.
  appPath: "/agents",
  component: WelcomeBody,
});

function WelcomeBody() {
  return (
    <PaneChrome pane={welcomePane} title="Welcome">
      <WelcomeView />
    </PaneChrome>
  );
}

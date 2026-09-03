import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { WelcomeView } from "./components/welcome-view";

const welcomeRoute = defineRoute({
  id: "welcome",
  segment: "",
});

export const welcomePane = Pane.define({
  route: welcomeRoute,
  app: agentManagerApp,
  // Index/landing pane for the agent-manager app, reached at its bare root
  // (`/agents`). Scoping it stops welcome being a global fallback that bleeds
  // into every other app.
  appIndex: true,
  component: WelcomeBody,
});

function WelcomeBody() {
  return (
    <PaneChrome pane={welcomePane} title="Welcome">
      <WelcomeView />
    </PaneChrome>
  );
}

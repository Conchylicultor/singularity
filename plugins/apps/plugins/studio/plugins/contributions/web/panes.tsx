import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { studioApp } from "@plugins/apps/plugins/studio/plugins/shell/core";
import { ContributionsView } from "./components/contributions-view";

const contributionsRoute = defineRoute({
  id: "contributions",
  segment: "contributions",
});

export const contributionsPane = Pane.define({
  route: contributionsRoute,
  app: studioApp,
  component: ContributionsBody,
  width: 700,
});

function ContributionsBody() {
  return (
    <PaneChrome pane={contributionsPane} title="Contributions">
      <ContributionsView />
    </PaneChrome>
  );
}

import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { ContributionsView } from "./components/contributions-view";

export const contributionsPane = Pane.define({
  id: "contributions",
  segment: "contributions",
  component: ContributionsBody,
  chrome: false,
  width: 700,
});

function ContributionsBody() {
  return (
    <PaneChrome pane={contributionsPane} title="Contributions">
      <ContributionsView />
    </PaneChrome>
  );
}

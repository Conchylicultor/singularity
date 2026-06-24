import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { CompositionsView } from "./components/compositions-view";

export const compositionsPane = Pane.define({
  id: "compositions",
  segment: "compositions",
  component: CompositionsBody,
  width: 380,
});

function CompositionsBody() {
  return (
    <PaneChrome pane={compositionsPane} title="Compositions">
      <CompositionsView />
    </PaneChrome>
  );
}

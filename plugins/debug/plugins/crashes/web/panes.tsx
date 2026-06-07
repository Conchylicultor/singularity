import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { CrashesView } from "./components/crashes-view";

export const crashesPane = Pane.define({
  id: "crashes",
  segment: "crashes",
  component: CrashesBody,
});

function CrashesBody() {
  return (
    <PaneChrome pane={crashesPane} title="Crashes">
      <CrashesView />
    </PaneChrome>
  );
}

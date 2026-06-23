import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { BootProfileGantt } from "./components/boot-profile-gantt";

export const bootProfilePane = Pane.define({
  id: "debug-boot-profile",
  segment: "boot-profile",
  component: BootProfileBody,
});

function BootProfileBody() {
  return (
    <PaneChrome pane={bootProfilePane} title="Boot Profile">
      <BootProfileGantt />
    </PaneChrome>
  );
}

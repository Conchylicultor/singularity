import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { SettingsPanel } from "./components/settings-panel";

export const settingsPane = Pane.define({
  id: "settings",
  segment: "settings",
  component: SettingsBody,
});

function SettingsBody() {
  return (
    <PaneChrome pane={settingsPane} title="Settings">
      <SettingsPanel />
    </PaneChrome>
  );
}

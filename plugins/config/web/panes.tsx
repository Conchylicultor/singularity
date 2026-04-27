import { Pane, PaneChrome } from "@plugins/pane/web";
import { SettingsPanel } from "./components/settings-panel";

export const settingsPane = Pane.define({
  id: "settings",
  path: "/settings",
  component: SettingsBody,
});

function SettingsBody() {
  return (
    <PaneChrome pane={settingsPane} title="Settings">
      <SettingsPanel />
    </PaneChrome>
  );
}

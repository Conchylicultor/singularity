import { Pane } from "@plugins/pane/web";
import { SettingsPanel } from "./components/settings-panel";

export const settingsPane = Pane.define({
  id: "settings",
  path: "/settings",
  component: SettingsPanel,
});

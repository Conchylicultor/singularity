import type { PaneDescriptor } from "@plugins/shell/web/commands";
import { SettingsPanel } from "./components/settings-panel";

export function settingsPane(): PaneDescriptor {
  return {
    title: "Settings",
    component: SettingsPanel,
    path: "/settings",
  };
}

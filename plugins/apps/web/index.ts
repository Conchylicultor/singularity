import { Core, type PluginDefinition } from "@core";
import { AppsLayout } from "./components/apps-layout";

export { Apps } from "./slots";

export default {
  id: "apps",
  name: "Apps",
  description:
    "App switcher rail. Wraps per-app shells; plugins contribute via Apps.App.",
  loadBearing: true,
  contributions: [Core.Root({ component: AppsLayout })],
} satisfies PluginDefinition;

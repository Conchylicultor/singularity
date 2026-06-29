import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { AppIconView } from "./components/app-icon-view";
export { mdAppIcon, appIconComponent, DEFAULT_APP_ICON } from "./internal/app-icon";

export default {
  description:
    "Canonical, serializable app-icon descriptor (Material Design now, image variant later); composes icon-picker for author-time extraction and rendering.",
  contributions: [],
} satisfies PluginDefinition;

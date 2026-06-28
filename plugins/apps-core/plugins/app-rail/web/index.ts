import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { AppRail } from "./components/app-rail";

export default {
  description:
    "App rail: the far-left icon strip that switches the focused tab between apps, deriving its own active-app highlight and chrome theme scope.",
} satisfies PluginDefinition;

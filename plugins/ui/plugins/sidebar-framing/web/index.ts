import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { AppShell } from "@plugins/primitives/plugins/app-shell/web";
import { sidebarFramingWeb } from "./region";

export { SidebarFraming } from "./region";

export default {
  description:
    "Per-app sidebar framing region (flush / floating / inset). Contributes its variant-region host into AppShell.Framing.",
  contributions: [
    ...sidebarFramingWeb.contributions,
    AppShell.Framing({ component: sidebarFramingWeb.Region }),
  ],
} satisfies PluginDefinition;

import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { AppShell } from "@plugins/primitives/plugins/app-shell/web";
import { AppBrand } from "./components/app-brand";

export default {
  description:
    "The app brand every app shell draws (AppShell.Brand): the launcher — the current app's own mark — click for the app gallery (the default Apps.App entry), hover or ArrowDown for a grid of every other installed app (switching exactly as the rail does) — plus, as the sidebar header, the current app's name linking to its own home.",
  contributions: [AppShell.Brand({ component: AppBrand })],
} satisfies PluginDefinition;

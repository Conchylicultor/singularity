import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { AppShellLayout } from "./components/app-shell-layout";
export type {
  AppShellSidebarItem,
  AppShellToolbarItem,
} from "./components/app-shell-layout";
export { SidebarNavItem, sidebarNavItem } from "./components/sidebar-nav-item";
export { SidebarPaneSection } from "./components/sidebar-pane-section";

export default {
  id: "app-shell",
  name: "App Shell",
  description:
    "Reusable sidebar + toolbar + miller-columns layout. Apps instantiate with their own slot set.",
  contributions: [],
} satisfies PluginDefinition;

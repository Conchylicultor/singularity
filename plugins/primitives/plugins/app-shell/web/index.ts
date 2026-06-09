import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { AppShellLayout } from "./components/app-shell-layout";
export type {
  AppShellSidebarItem,
  AppShellToolbarItem,
} from "./components/app-shell-layout";
export { SidebarNavItem, sidebarNavItem } from "./components/sidebar-nav-item";
export { SidebarPaneSection } from "./components/sidebar-pane-section";

export default {
  description:
    "Universal app shell: opt-in sidebar + opt-in toolbar chrome wrapping an app-supplied main-area layout renderer (children). With neither slot it collapses to a transparent full-surface host.",
  contributions: [],
} satisfies PluginDefinition;

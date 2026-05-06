import type { PluginDefinition } from "@core";

export { AppShellLayout } from "./components/app-shell-layout";
export type {
  AppShellSidebarItem,
  AppShellToolbarItem,
} from "./components/app-shell-layout";

export default {
  id: "app-shell",
  name: "App Shell",
  description:
    "Reusable sidebar + toolbar + miller-columns layout. Apps instantiate with their own slot set.",
  contributions: [],
} satisfies PluginDefinition;

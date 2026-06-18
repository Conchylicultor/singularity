import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { AppShellSidebarItem, AppShellToolbarItem } from "@plugins/primitives/plugins/app-shell/web";

export const Shell = {
  Sidebar: defineRenderSlot<AppShellSidebarItem>("shell.sidebar", {
    docLabel: (p) => p.title,
  }),

  Toolbar: defineRenderSlot<AppShellToolbarItem>("shell.toolbar", {
    docLabel: (p) => ("label" in p ? p.label : undefined),
  }),
};

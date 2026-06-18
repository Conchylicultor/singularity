import type {
  AppShellSidebarItem,
  AppShellToolbarItem,
} from "@plugins/primitives/plugins/app-shell/web";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export const Studio = {
  Sidebar: defineRenderSlot<AppShellSidebarItem>("studio.sidebar", {
    docLabel: (p) => p.title,
  }),

  Toolbar: defineRenderSlot<AppShellToolbarItem>("studio.toolbar", {
    docLabel: (p) => ("label" in p ? p.label : undefined),
  }),
};

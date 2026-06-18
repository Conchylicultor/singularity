import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type {
  AppShellSidebarItem,
  AppShellToolbarItem,
} from "@plugins/primitives/plugins/app-shell/web";

export const FileExplorer = {
  Sidebar: defineRenderSlot<AppShellSidebarItem>("file-explorer.sidebar", {
    docLabel: (p) => p.title,
  }),

  Toolbar: defineRenderSlot<AppShellToolbarItem>("file-explorer.toolbar", {
    docLabel: (p) => ("label" in p ? p.label : undefined),
  }),
};

import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type {
  AppShellSidebarItem,
  AppShellToolbarItem,
} from "@plugins/primitives/plugins/app-shell/web";

export const WorkflowsApp = {
  Sidebar: defineRenderSlot<AppShellSidebarItem>("workflows-app.sidebar", {
    docLabel: (p) => p.title,
  }),

  Toolbar: defineRenderSlot<AppShellToolbarItem>("workflows-app.toolbar", {
    docLabel: (p) => ("label" in p ? p.label : undefined),
  }),
};

import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { AppShellSidebarItem } from "@plugins/primitives/plugins/app-shell/web";

export const DebugApp = {
  Sidebar: defineRenderSlot<AppShellSidebarItem>("debug-app.sidebar", {
    docLabel: (p) => p.title,
  }),

  Toolbar: defineRenderSlot<{
    label?: string;
    icon?: ComponentType<{ className?: string }>;
    onClick?: () => void;
    component?: ComponentType;
    group?: string;
  }>("debug-app.toolbar", {
    docLabel: (p) => p.label,
  }),
};

import type { ComponentType } from "react";
import type { AppShellSidebarItem } from "@plugins/primitives/plugins/app-shell/web";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export const Studio = {
  Sidebar: defineRenderSlot<AppShellSidebarItem>("studio.sidebar", {
    docLabel: (p) => p.title,
  }),

  Toolbar: defineRenderSlot<{
    label?: string;
    icon?: ComponentType<{ className?: string }>;
    onClick?: () => void;
    component?: ComponentType;
    group?: string;
  }>("studio.toolbar", {
    docLabel: (p) => p.label,
  }),
};

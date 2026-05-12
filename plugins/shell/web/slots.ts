import { defineSlot } from "@core";
import type { ComponentType } from "react";
import { Reorder } from "@plugins/reorder/web";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { AppShellSidebarItem } from "@plugins/primitives/plugins/app-shell/web";

export const Shell = {
  Sidebar: defineRenderSlot<AppShellSidebarItem>("shell.sidebar", {
    docLabel: (p) => p.title,
    reorder: { getLabel: (item) => item.title, enableGroups: true },
  }),

  Toolbar: Reorder.area(
    defineSlot<{
      label?: string;
      icon?: ComponentType<{ className?: string }>;
      onClick?: () => void;
      component?: ComponentType;
      group?: string;
    }>("shell.toolbar", { docLabel: (p) => p.label }),
    {
      getLabel: (item) => item.label ?? item.id,
      enableGroups: true,
    },
  ),
};

import { defineSlot } from "@core";
import type { ComponentType } from "react";
import { Reorder } from "@plugins/reorder/web";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { AppShellSidebarItem } from "@plugins/primitives/plugins/app-shell/web";

export const FileExplorer = {
  Sidebar: defineRenderSlot<AppShellSidebarItem>("file-explorer.sidebar", {
    docLabel: (p) => p.title,
    reorder: { getLabel: (item) => item.title },
  }),

  Toolbar: Reorder.area(
    defineSlot<{
      label?: string;
      icon?: ComponentType<{ className?: string }>;
      onClick?: () => void;
      component?: ComponentType;
      group?: string;
    }>("file-explorer.toolbar", { docLabel: (p) => p.label }),
    {
      getGroup: (item) => item.group ?? null,
      getLabel: (item) => item.label ?? item.id,
    },
  ),
};

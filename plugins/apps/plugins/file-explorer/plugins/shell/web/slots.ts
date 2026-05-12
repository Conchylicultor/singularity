import { defineSlot } from "@core";
import type { ComponentType } from "react";
import { Reorder } from "@plugins/reorder/web";

export const FileExplorer = {
  Sidebar: Reorder.area(
    defineSlot<{
      title: string;
      icon: ComponentType<{ className?: string }>;
      onClick?: () => void;
      component?: ComponentType;
      group?: string;
      labelExtra?: ComponentType;
      scroll?: boolean;
    }>("file-explorer.sidebar", { docLabel: (p) => p.title }),
    { getGroup: (item) => item.group ?? null, getLabel: (item) => item.title },
  ),

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

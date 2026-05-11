import { defineSlot } from "@core";
import type { ComponentType } from "react";
import { Reorder } from "@plugins/reorder/web";

export const Shell = {
  Sidebar: Reorder.area(
    defineSlot<{
      title: string;
      icon: ComponentType<{ className?: string }>;
      onClick?: () => void;
      component?: ComponentType;
      group?: string;
      labelExtra?: ComponentType;
      /** When true, only the section label is pinned; the component renders in an independent scroll region. */
      scroll?: boolean;
    }>("shell.sidebar"),
    { getGroup: (item) => item.group ?? null, getLabel: (item) => item.title, enableGroups: true },
  ),

  Toolbar: Reorder.area(
    defineSlot<{
      label?: string;
      icon?: ComponentType<{ className?: string }>;
      onClick?: () => void;
      component?: ComponentType;
      group?: string;
    }>("shell.toolbar"),
    {
      getLabel: (item) => item.label ?? item.id,
      enableGroups: true,
    },
  ),
};

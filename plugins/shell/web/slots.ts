import { defineSlot } from "@core";
import type { ComponentType } from "react";
import type { PaneDescriptor } from "./commands";

export const Shell = {
  Sidebar: defineSlot<{
    title: string;
    icon: ComponentType<{ className?: string }>;
    component: ComponentType;
  }>("shell.sidebar"),

  Toolbar: defineSlot<{
    label?: string;
    icon?: ComponentType<{ className?: string }>;
    onClick?: () => void;
    component?: ComponentType;
    group?: string;
  }>("shell.toolbar"),

  StatusBar: defineSlot<{
    component: ComponentType;
  }>("shell.statusbar"),

  Route: defineSlot<{
    pattern: string;
    resolve: (params: Record<string, string>) => PaneDescriptor;
  }>("shell.route"),
};

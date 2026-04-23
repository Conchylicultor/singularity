import { defineSlot } from "@core";
import type { ComponentType } from "react";

export const Shell = {
  Sidebar: defineSlot<{
    title: string;
    icon: ComponentType<{ className?: string }>;
    onClick?: () => void;
    component?: ComponentType;
    group?: string;
  }>("shell.sidebar"),

  Toolbar: defineSlot<{
    label?: string;
    icon?: ComponentType<{ className?: string }>;
    onClick?: () => void;
    component?: ComponentType;
    group?: string;
  }>("shell.toolbar"),
};

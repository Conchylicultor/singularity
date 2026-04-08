import { defineSlot } from "@core";
import type { ComponentType } from "react";

export const Shell = {
  Sidebar: defineSlot<{
    title: string;
    icon: ComponentType<{ className?: string }>;
    component: ComponentType;
  }>("shell.sidebar"),

  Main: defineSlot<{
    title: string;
    component: ComponentType;
  }>("shell.main"),

  Toolbar: defineSlot<{
    label: string;
    icon: ComponentType<{ className?: string }>;
    onClick: () => void;
  }>("shell.toolbar"),

  StatusBar: defineSlot<{
    component: ComponentType;
  }>("shell.statusbar"),
};

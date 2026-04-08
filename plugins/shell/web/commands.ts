import { defineCommand } from "@core";
import type { ComponentType } from "react";

export interface PaneDescriptor {
  title: string;
  component: ComponentType;
}

export const Shell = {
  OpenPane: defineCommand<PaneDescriptor, string>("shell.open-pane"),
};

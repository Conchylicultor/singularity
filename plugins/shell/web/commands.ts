import { defineCommand } from "@core";
import type { ComponentType } from "react";

export interface PaneDescriptor {
  title: string;
  component: ComponentType;
}

export type ToastVariant = "default" | "success" | "error" | "warning" | "info";

export interface ToastArgs {
  title?: string;
  description: string;
  variant?: ToastVariant;
}

export const Shell = {
  OpenPane: defineCommand<PaneDescriptor, string>("shell.open-pane"),
  Toast: defineCommand<ToastArgs, void>("shell.toast"),
};

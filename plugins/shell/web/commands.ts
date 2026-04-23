import { defineCommand } from "@core";

export type ToastVariant = "default" | "success" | "error" | "warning" | "info";

export interface ToastArgs {
  title?: string;
  description: string;
  variant?: ToastVariant;
}

export const Shell = {
  Toast: defineCommand<ToastArgs, void>("shell.toast"),
};

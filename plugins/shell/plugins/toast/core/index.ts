export type ToastVariant = "default" | "success" | "error" | "warning" | "info";

export interface ToastArgs {
  title?: string;
  description: string;
  variant?: ToastVariant;
  /** Optional single action button rendered in the toast (e.g. "Undo"). */
  action?: { label: string; onClick: () => void };
}

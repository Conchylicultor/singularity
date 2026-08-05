import type { ReactNode } from "react";
import { openDialog } from "@plugins/primitives/plugins/imperative-dialog/web";
import { ConfirmDialogBody } from "../components/confirm-dialog-body";

export interface ConfirmDialogOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Extra body content between the description and the action row (e.g. a copyable command). */
  children?: ReactNode;
  /** The destructive action. If it rejects, the dialog stays open and shows the error. */
  onConfirm: () => void | Promise<unknown>;
}

/**
 * Imperative destructive confirm. Fire-and-forget: `void confirmDialog({...})`.
 * Resolves `true` iff `onConfirm` completed (the dialog then auto-closed); `false`
 * on Cancel / Escape / backdrop. Never `await` it inside a `Button`'s onClick — the
 * launching button would auto-pend for the whole dialog lifetime. Gets the unified
 * `sm` panel + padding from the host's DialogContent — the body carries no
 * Surface/width of its own.
 */
export function confirmDialog(opts: ConfirmDialogOptions): Promise<boolean> {
  let confirmed = false;
  return openDialog(
    (close) => (
      <ConfirmDialogBody
        {...opts}
        onClose={close}
        onConfirmed={() => {
          confirmed = true;
        }}
      />
    ),
    { size: "sm" },
  ).then(() => confirmed);
}

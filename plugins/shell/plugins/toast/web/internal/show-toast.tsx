import { useEffect, useRef } from "react";
import { toast as sonnerToast } from "sonner";
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";
import type { ToastArgs } from "../../core";

/** Mutable holder so the click handler can read the toast id assigned after `toast()` returns. */
type ToastIdHolder = { id?: number | string };

/**
 * Makes the whole enclosing sonner toast dismiss on click, while still allowing the
 * user to select / drag the text: a click that ends an active text selection is ignored.
 */
function ClickToDismiss({ holder, children }: { holder: ToastIdHolder; children: React.ReactNode }) {
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const li = anchorRef.current?.closest<HTMLElement>("[data-sonner-toast]");
    if (!li) return;
    li.style.cursor = "pointer";
    const onClick = () => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) return;
      if (holder.id != null) sonnerToast.dismiss(holder.id);
    };
    li.addEventListener("click", onClick);
    return () => li.removeEventListener("click", onClick);
  }, [holder]);

  return (
    <span ref={anchorRef} style={{ display: "contents" }}>
      {children}
    </span>
  );
}

/**
 * Fire a global toast. Backed by sonner's global imperative API — callable from
 * anywhere; if no `<ToasterHost/>` is mounted the enqueue simply has no renderer
 * (a silent no-op, never a throw). Deprecates the former `shell.toast` command.
 */
export function showToast({ title, description, variant, action }: ToastArgs): void {
  const rawMessage = title ?? description;
  const rawDescription = title ? description : undefined;
  const fn = variant && variant !== "default" ? sonnerToast[variant] : sonnerToast;
  const holder: ToastIdHolder = {};
  holder.id = fn(
    <ClickToDismiss holder={holder}>
      <ContentScope fill={false}>{rawMessage}</ContentScope>
    </ClickToDismiss>,
    {
      description: rawDescription ? <ContentScope fill={false}>{rawDescription}</ContentScope> : undefined,
      // sonner renders + dismisses the action button itself; the caller only
      // supplies the intent (e.g. Undo).
      action: action ? { label: action.label, onClick: () => action.onClick() } : undefined,
    },
  );
}

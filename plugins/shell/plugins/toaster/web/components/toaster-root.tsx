import { useEffect, useRef } from "react";
import { Toaster as Sonner, toast as sonnerToast } from "sonner";
import { ShellCommands, type ToastArgs } from "@plugins/shell/web";
import { useColorMode } from "@plugins/ui/plugins/theme-engine/web";
import { useChromeThemeScope } from "@plugins/apps-core/web";
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";

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

export function ToasterRoot() {
  const colorMode = useColorMode();
  const themeScope = useChromeThemeScope();

  ShellCommands.Toast.useHandler(({ title, description, variant }: ToastArgs) => {
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
      },
    );
  });

  return (
    // Sonner renders its toast list inline (a fixed-position `<ol
    // data-sonner-toaster>`, not a React portal), so the `var(--popover)` /
    // `var(--border)` / `var(--radius)` in the style prop resolve from this
    // wrapper's theme scope. We wear the cross-app chrome scope: the focused
    // app's theme when a single app fills the surface (docked / solo), the
    // neutral global theme in desktop mode (no single app owns the chrome).
    <div data-theme-scope={themeScope}>
      <Sonner
        theme={colorMode}
        className="toaster group"
        style={
          {
            "--normal-bg": "var(--popover)",
            "--normal-text": "var(--popover-foreground)",
            "--normal-border": "var(--border)",
            "--border-radius": "var(--radius)",
          } as React.CSSProperties
        }
      />
    </div>
  );
}

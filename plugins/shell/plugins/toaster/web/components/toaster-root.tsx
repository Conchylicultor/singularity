import { Toaster as Sonner, toast as sonnerToast } from "sonner";
import { ShellCommands, type ToastArgs } from "@plugins/shell/web";

export function ToasterRoot() {
  ShellCommands.Toast.useHandler(({ title, description, variant }: ToastArgs) => {
    const opts = { description: title ? description : undefined };
    const message = title ?? description;
    const fn = variant && variant !== "default" ? sonnerToast[variant] : sonnerToast;
    fn(message, opts);
  });

  return (
    <Sonner
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
  );
}

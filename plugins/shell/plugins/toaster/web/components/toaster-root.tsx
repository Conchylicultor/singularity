import { Toaster as Sonner, toast as sonnerToast } from "sonner";
import { ShellCommands, type ToastArgs } from "@plugins/shell/web";
import { useColorMode } from "@plugins/ui/plugins/theme-engine/web";
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";

export function ToasterRoot() {
  const colorMode = useColorMode();

  ShellCommands.Toast.useHandler(({ title, description, variant }: ToastArgs) => {
    const rawMessage = title ?? description;
    const rawDescription = title ? description : undefined;
    const fn = variant && variant !== "default" ? sonnerToast[variant] : sonnerToast;
    fn(<ContentScope fill={false}>{rawMessage}</ContentScope>, {
      description: rawDescription ? <ContentScope fill={false}>{rawDescription}</ContentScope> : undefined,
    });
  });

  return (
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
  );
}

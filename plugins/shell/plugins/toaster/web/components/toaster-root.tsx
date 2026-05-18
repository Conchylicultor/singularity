import { useEffect } from "react";
import { Toaster as Sonner, toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { EndpointError } from "@plugins/infra/plugins/endpoints/web";
import { ShellCommands, type ToastArgs } from "@plugins/shell/web";

function mutationErrorMessage(error: unknown): string {
  if (error instanceof EndpointError) {
    const { body } = error;
    if (body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string") {
      return (body as { message: string }).message;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export function ToasterRoot() {
  const queryClient = useQueryClient();

  ShellCommands.Toast.useHandler(({ title, description, variant }: ToastArgs) => {
    const opts = { description: title ? description : undefined };
    const message = title ?? description;
    const fn = variant && variant !== "default" ? toast[variant] : toast;
    fn(message, opts);
  });

  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const message =
        reason instanceof Error ? reason.message : String(reason);
      toast.error(message);
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);

  useEffect(() => {
    return queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== "updated") return;
      if (event.action.type !== "error") return;
      if (event.mutation.options.meta?.suppressError) return;
      toast.error(mutationErrorMessage(event.action.error));
    });
  }, [queryClient]);

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

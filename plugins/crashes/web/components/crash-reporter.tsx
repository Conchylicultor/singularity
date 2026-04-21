import { useEffect } from "react";
import { registerBoundaryReporter } from "@core";
import { ShellCommands } from "@plugins/shell/web";
import { report, type CrashReportResult } from "../report";

// Effect-only Core.Root contribution. Installs window-level error + rejection
// listeners and forwards to POST /api/crashes. React render errors come in
// through the componentDidCatch hook in plugin-core/error-boundary.tsx.
export function CrashReporter() {
  useEffect(() => {
    const announce = (errorType: string | null, message: string) =>
      (r: CrashReportResult | null) => {
        if (!r || !r.wasNew) return;
        const label = errorType ? `${errorType}: ${message}` : message;
        ShellCommands.Toast({
          title: "Crash reported",
          description: label.length > 140 ? `${label.slice(0, 137)}...` : label,
          variant: "error",
        });
      };

    const onError = (e: ErrorEvent) => {
      const err = e.error instanceof Error ? e.error : null;
      const errorType = err?.name ?? null;
      const message = err?.message ?? e.message ?? "Unknown error";
      void report({
        source: "browser-error",
        errorType,
        message,
        stack: err?.stack ?? null,
        url: window.location.href,
        userAgent: navigator.userAgent,
      }).then(announce(errorType, message));
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const err = e.reason instanceof Error ? e.reason : null;
      const errorType = err?.name ?? null;
      const message = err?.message ?? String(e.reason ?? "Unhandled rejection");
      void report({
        source: "browser-rejection",
        errorType,
        message,
        stack: err?.stack ?? null,
        url: window.location.href,
        userAgent: navigator.userAgent,
      }).then(announce(errorType, message));
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    registerBoundaryReporter((r) => {
      void report({
        source: "react-boundary",
        errorType: r.error.name,
        message: r.error.message,
        stack: r.error.stack ?? null,
        componentStack: r.componentStack,
        slot: r.slot,
        label: r.label,
        url: window.location.href,
        userAgent: navigator.userAgent,
      }).then(announce(r.error.name, r.error.message));
    });

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      registerBoundaryReporter(null);
    };
  }, []);

  return null;
}

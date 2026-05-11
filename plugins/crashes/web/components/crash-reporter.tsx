import { useEffect } from "react";
import { registerBoundaryReporter } from "@plugins/primitives/plugins/error-boundary/web";
import { report } from "../report";

export function CrashReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      const err = e.error instanceof Error ? e.error : null;
      void report({
        source: "browser-error",
        errorType: err?.name ?? null,
        message: err?.message ?? e.message,
        stack: err?.stack ?? null,
        url: window.location.href,
        userAgent: navigator.userAgent,
      });
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const err = e.reason instanceof Error ? e.reason : null;
      void report({
        source: "browser-rejection",
        errorType: err?.name ?? null,
        message: err?.message ?? String(e.reason ?? "Unhandled rejection"),
        stack: err?.stack ?? null,
        url: window.location.href,
        userAgent: navigator.userAgent,
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    registerBoundaryReporter((r) => {
      const promise = report({
        source: "react-boundary",
        errorType: r.error.name,
        message: r.error.message,
        stack: r.error.stack ?? null,
        componentStack: r.componentStack,
        slot: r.slot,
        label: r.label,
        url: window.location.href,
        userAgent: navigator.userAgent,
      });
      return promise.then((result) => ({ taskId: result?.taskId ?? null }));
    });

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      registerBoundaryReporter(null);
    };
  }, []);

  return null;
}

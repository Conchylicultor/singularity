import { useEffect } from "react";
import { registerModelCorruptionReporter } from "../../core";
import { report } from "@plugins/crashes/web";

/**
 * Routes corrupt/unknown stored-model signals into the visible crash-report
 * pipeline. Mounted once via Core.Root at app startup; installs the sink so an
 * unparseable persisted model surfaces as a real reported browser crash (deduped
 * per distinct value in core) rather than a buried console.error line.
 */
export function ModelCorruptionReporter() {
  useEffect(() => {
    registerModelCorruptionReporter((message) => {
      const err = new Error(message);
      err.name = "CorruptModelError";
      void report({
        source: "browser-error",
        errorType: err.name,
        message: err.message,
        stack: err.stack ?? null,
        url: window.location.href,
        userAgent: navigator.userAgent,
      });
    });
    return () => registerModelCorruptionReporter((m) => console.error(m));
  }, []);

  return null;
}

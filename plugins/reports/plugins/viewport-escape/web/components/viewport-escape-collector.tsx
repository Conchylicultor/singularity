import { useEffect } from "react";
import { viewportEscapeReportSink } from "@plugins/primitives/plugins/css/plugins/viewport-overlay/web";
import { report } from "@plugins/reports/web";
import type { ViewportEscapePayload } from "@plugins/reports/plugins/viewport-escape/core";

// A Core.Root side-effect component. The viewport-overlay primitive is a
// primitive and must not import `reports`, so it emits a neutral
// `ViewportEscapeFault` into a module-level sink; this component owns the
// mapping from that body to a `kind: "viewport-escape"` report — the same
// inversion crash uses for error-boundary's boundaryReportSink. Renders nothing.
//
// Until this existed the sink had NO consumer, and `defineReportSink` is a
// silent no-op until something registers. The auditor throws in dev, so during
// development it is loud; in production every fault it found was emitted into
// nothing. That is precisely backwards — a clipped fullscreen or a rail painting
// over the app is exactly the kind of "it looks almost right" bug that only ever
// shows up on someone else's machine.
export function ViewportEscapeCollector() {
  useEffect(() => {
    viewportEscapeReportSink.register((d) => {
      // `satisfies` is the compile-time pin between the primitive's
      // `ViewportEscapeFaultKind` and the duplicated enum in this plugin's core
      // (which cannot import a web-runtime type — see the schema's comment).
      // This mapping is the one place that imports both, so a fault kind added
      // to the primitive fails to typecheck HERE rather than 400-ing at ingest.
      const data = {
        fault: d.kind,
        subject: d.subject,
        blocker: d.blocker,
        message: d.message,
      } satisfies ViewportEscapePayload;
      void report({
        kind: "viewport-escape",
        source: "client-viewport-escape",
        message: `Viewport escape (${d.subject}) — ${d.kind}: ${d.message}`,
        url: window.location.href,
        userAgent: navigator.userAgent,
        data,
      });
    });

    return () => {
      viewportEscapeReportSink.register(null);
    };
  }, []);

  return null;
}

import { useEffect } from "react";
import { adaptiveBarReportSink } from "@plugins/primitives/plugins/adaptive-bar/web";
import { report } from "@plugins/reports/web";
import type { AdaptiveBarPayload } from "@plugins/reports/plugins/adaptive-bar/core";

// A Core.Root side-effect component. The adaptive-bar primitive is a primitive
// and must not import `reports`, so it emits a neutral `AdaptiveBarFault` into a
// module-level sink; this component owns the mapping from that body to a
// `kind: "adaptive-bar"` report — exactly the inversion crash uses for
// error-boundary's boundaryReportSink. Renders nothing.
//
// Until this existed the sink had NO consumer, and `defineReportSink` is a
// silent no-op until something registers: every adaptive-bar layout fault in
// production was dropped on the floor, while the primitive's own docs promised a
// filed report. That is how a fit-vs-layout disagreement was able to take the
// whole Debug → Layout Lab pane down without a single row appearing anywhere.
//
// NO THRESHOLD HERE, deliberately. The primitive already refuses to report the
// normal case at the source: running out of room and relocating widgets is what
// the bar is FOR and never reaches the sink. Every body that arrives is a broken
// premise — one report each, deduped server-side by (fault, label).
export function AdaptiveBarCollector() {
  useEffect(() => {
    adaptiveBarReportSink.register((d) => {
      // `satisfies` is the compile-time pin between the primitive's
      // `AdaptiveBarFaultKind` and the duplicated enum in this plugin's core
      // (which cannot import a web-runtime type — see the schema's comment).
      // This mapping is the one place that imports both, so a fault kind added
      // to the primitive fails to typecheck HERE rather than 400-ing at ingest.
      const data = {
        fault: d.kind,
        label: d.label,
        message: d.message,
      } satisfies AdaptiveBarPayload;
      void report({
        kind: "adaptive-bar",
        source: "client-adaptive-bar",
        message: `Adaptive bar (${d.label}) — ${d.kind}: ${d.message}`,
        url: window.location.href,
        userAgent: navigator.userAgent,
        data,
      });
    });

    return () => {
      adaptiveBarReportSink.register(null);
    };
  }, []);

  return null;
}

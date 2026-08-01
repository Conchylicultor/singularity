import { useEffect } from "react";
import { caretFlightReportSink } from "@plugins/page/plugins/editor/web";
import { report } from "@plugins/reports/web";

// A Core.Root side-effect component. The page editor must not import `reports`,
// so its caret authority emits a neutral `CaretFlightAbortReport` into a
// module-level sink whenever a claimed caret landing is given up on; this
// component owns the mapping from that body to a `kind: "caret-flight"` report —
// exactly the inversion crash uses for error-boundary's boundaryReportSink.
// Renders nothing.
//
// NO THRESHOLD HERE, deliberately, unlike the stale-drop collector: the
// authority already suppresses the benign case at the source (an abort with an
// EMPTY buffer is an ordinary cancellation — the user clicked away before the
// landing — and never reaches the sink). Every body that arrives here therefore
// represents keystrokes that had to be rescued or were lost, which is exactly one
// report each.
export function CaretFlightCollector() {
  useEffect(() => {
    caretFlightReportSink.register((d) => {
      void report({
        kind: "caret-flight",
        source: "client-caret-flight",
        message: `Caret flight aborted (${d.reason}): ${d.buffered} buffered keystrokes ${d.replayedInto === null ? "LOST" : "replayed into the origin"}`,
        url: window.location.href,
        userAgent: navigator.userAgent,
        data: d as unknown as Record<string, unknown>,
      });
    });

    return () => {
      caretFlightReportSink.register(null);
    };
  }, []);

  return null;
}

import { useEffect } from "react";
import { optimisticDivergenceReportSink } from "@plugins/primitives/plugins/optimistic-mutation/web";
import { report } from "@plugins/reports/web";

// A Core.Root side-effect component. The optimistic-mutation primitive is a
// primitive and must not import `reports`, so it emits a neutral
// OptimisticDivergenceReport into a module-level sink; this component owns the
// mapping from that body to a `kind: "optimistic-divergence"` report — exactly
// the inversion crash uses for error-boundary's boundaryReportSink. Renders
// nothing.
export function OptimisticDivergenceCollector() {
  useEffect(() => {
    optimisticDivergenceReportSink.register((d) => {
      const what = d.label ? `${d.resourceKey}/${d.label}` : d.resourceKey;
      // opSummaries is empty when the consumer passed no `describeOp` — say
      // "an optimistic op" rather than counting an unknown number of them.
      const ops =
        d.opSummaries.length > 0
          ? `${d.opSummaries.length} ${d.opSummaries.length === 1 ? "op" : "ops"} (${d.opSummaries.join(", ")})`
          : "an optimistic op";
      void report({
        kind: "optimistic-divergence",
        source: "client-optimistic-divergence",
        message: `Optimistic divergence: ${what} — ${ops} never confirmed after ${d.misses} authoritative pushes`,
        url: window.location.href,
        userAgent: navigator.userAgent,
        data: d as unknown as Record<string, unknown>,
      });
    });

    return () => {
      optimisticDivergenceReportSink.register(null);
    };
  }, []);

  return null;
}

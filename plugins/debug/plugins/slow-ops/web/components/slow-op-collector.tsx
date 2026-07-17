import { useEffect } from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { useConfig } from "@plugins/config_v2/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { registerSlowResourceReporter } from "@plugins/primitives/plugins/live-state/web";
import { getBootTrace } from "@plugins/primitives/plugins/perfs/plugins/boot-trace/web";
import { toClientBootSection } from "@plugins/debug/plugins/trace/plugins/client-boot/core";
import { slowOpConfig } from "../../core";
import { submitClientSlowOp } from "../../shared/endpoints";

// A Core.Root side-effect component. It owns the two client-side slow-op
// signals — page-load timing and live-state element settle — and funnels both
// into the slow-ops client endpoint. Renders nothing.
export function SlowOpCollector() {
  const cfg = useConfig(slowOpConfig);

  // Keep the latest thresholds in a ref so the reporter closures (registered
  // once on mount) always read live values without re-registering on each
  // config change.
  const cfgRef = useLatestRef(cfg);

  // Page-load signal: measure first-content paint in a post-paint frame.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const ms = performance.now();
      const t = cfgRef.current.pageLoadMs;
      if (ms <= t) return;
      const durationMs = Math.round(ms);
      // eslint-disable-next-line endpoints/no-void-fetch-endpoint -- passive slow-op telemetry beacon (keepalive, report:false): silent and self-correcting; a failed beacon must never toast or recurse into the report path.
      void fetchEndpoint(
        submitClientSlowOp,
        {},
        {
          body: {
            // No `caller`: page-load's `operation` IS `location.pathname`, so a
            // route caller would just duplicate the operation label.
            operationKind: "page-load",
            operation: location.pathname,
            durationMs,
            thresholdMs: t,
            // The browser's own boot decomposition rides along (trimmed to
            // stay far under the 64KB keepalive cap), so the resulting trace
            // carries the client evidence for WHY the load was slow — not just
            // that it was.
            clientBoot: toClientBootSection(getBootTrace()),
          },
          keepalive: true,
          report: false,
        },
      );
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // Element signal: live-state resources hand us their mount → settle duration.
  useEffect(() => {
    registerSlowResourceReporter((info) => {
      // Mount→first-data settle IS the user-perceived time-to-content. Report it
      // as-is, including the cold-start boot wave: a slow boot is a real UX
      // regression, not noise. The gateway hot-swaps only once the backend is
      // ready (warm pool, migrations applied) — so a slow settle right after a
      // swap means readiness flipped before the backend could serve fast. Fix
      // that at the source; never suppress this signal.
      const t = cfgRef.current.elementMs;
      if (info.durationMs <= t) return;
      const durationMs = Math.round(info.durationMs);
      // eslint-disable-next-line endpoints/no-void-fetch-endpoint -- passive slow-op telemetry beacon (keepalive, report:false): silent and self-correcting; a failed beacon must never toast or recurse into the report path.
      void fetchEndpoint(
        submitClientSlowOp,
        {},
        {
          body: {
            operationKind: "element",
            operation: `${info.key} ${JSON.stringify(info.params)}`,
            durationMs,
            thresholdMs: t,
            // The route under which the element settled is the cheap, reliable
            // "who mounted this resource" attribution (resource key + params are
            // already in `operation`).
            caller: { kind: "route", label: location.pathname },
            // Additive root-cause attribution: was the notifications transport
            // still coming up when this resource mounted, and how much of the
            // settle window was transport bring-up? Threads through so the report
            // says WHY it was slow (transport cold-start vs resource compute).
            transportColdStart: info.transportColdStart,
            transportWaitMs: info.transportWaitMs,
          },
          keepalive: true,
          report: false,
        },
      );
    });
    return () => registerSlowResourceReporter(null);
  }, []);

  return null;
}

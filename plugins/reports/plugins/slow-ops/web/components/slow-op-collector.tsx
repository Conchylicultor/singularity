import { useEffect, useRef } from "react";
import { useConfig } from "@plugins/config_v2/web";
import { registerSlowResourceReporter } from "@plugins/primitives/plugins/live-state/web";
import { report } from "@plugins/reports/web";
import { slowOpConfig } from "../../shared/config";

// A Core.Root side-effect component (mirrors reports' ReportCollector). It owns
// the two client-side slow-op signals — page-load timing and live-state element
// settle — and funnels both into the shared report() entry point with
// kind "slow-op". Renders nothing.
export function SlowOpCollector() {
  const cfg = useConfig(slowOpConfig);

  // Keep the latest thresholds in a ref so the reporter closures (registered
  // once on mount) always read live values without re-registering on each
  // config change.
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  // Page-load signal: measure first-content paint in a post-paint frame.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const ms = performance.now();
      const t = cfgRef.current.pageLoadMs;
      if (ms <= t) return;
      const durationMs = Math.round(ms);
      void report({
        kind: "slow-op",
        source: "client-slow-op",
        operationKind: "page-load",
        operation: location.pathname,
        durationMs,
        thresholdMs: t,
        message: `page load ${durationMs}ms (threshold ${t}ms)`,
        url: location.href,
      });
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // Element signal: live-state resources hand us their mount → settle duration.
  useEffect(() => {
    registerSlowResourceReporter((info) => {
      const t = cfgRef.current.elementMs;
      if (info.durationMs <= t) return;
      const durationMs = Math.round(info.durationMs);
      void report({
        kind: "slow-op",
        source: "client-slow-op",
        operationKind: "element",
        operation: `${info.key} ${JSON.stringify(info.params)}`,
        durationMs,
        thresholdMs: t,
        message: `element ${info.key} settled in ${durationMs}ms (threshold ${t}ms)`,
      });
    });
    return () => registerSlowResourceReporter(null);
  }, []);

  return null;
}

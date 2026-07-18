import { Core } from "@plugins/framework/plugins/web-sdk/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { hydrateResource, resourceDescriptorByKey } from "@plugins/primitives/plugins/live-state/web";
import { recordBootSpan } from "@plugins/primitives/plugins/perfs/plugins/boot-trace/web";
import { report } from "@plugins/reports/web";
import { bootSnapshot } from "../../core";

// Boot-readiness task: fetch every boot-critical resource in ONE request and seed the
// live-state cache before first paint (no `pending` flash, no WS round-trip).
//
// The snapshot ships ONLY boot-critical resources (the single source is the shared
// descriptor's `bootCritical: true`, which `Resource.Declare` derives) and omits any whose loader failed this
// boot, so ITS KEYS are the authoritative set to hydrate. We resolve each key to its
// client descriptor via the live-state descriptor registry (populated when each
// descriptor module is evaluated, which happens before boot tasks run). A snapshot key
// with no registered descriptor means a boot-critical resource whose descriptor was not
// in the eager web import graph — a real bug, surfaced loudly rather than silently lost.
export const bootSnapshotTask = Core.Boot({
  run: async () => {
    const reqStart = performance.now();
    const { resources, timings } = await fetchEndpoint(bootSnapshot, {});
    const reqMs = performance.now() - reqStart;
    recordBootSpan({
      id: "boot-snapshot",
      phase: "boot-tasks",
      label: "Boot snapshot fetch",
      startMs: reqStart,
      durationMs: reqMs,
    });
    for (const key of Object.keys(resources)) {
      const t = timings[key];
      recordBootSpan({
        id: `res:${key}`,
        phase: "resources",
        label: key,
        startMs: reqStart,
        durationMs: reqMs,
        workMs: t?.workMs,
        detail: t?.source,
      });
    }
    const missing: string[] = [];
    for (const key of Object.keys(resources)) {
      const d = resourceDescriptorByKey(key);
      if (!d) {
        missing.push(key);
        continue;
      }
      // A descriptor with defaultParams (a windowed resource's default window)
      // hydrates at that tuple — the same one the server's fallback loader used
      // and the one useWindowResource subscribes to by default. Plain global
      // resources keep the param-less tuple.
      hydrateResource(d, d.defaultParams, resources[key]);
    }
    if (missing.length) {
      // The crash collector's window error listener is NOT mounted yet during the boot
      // window (RootRenderer mounts after runBootTasks resolves), so a queueMicrotask
      // throw would only reach the console. report() is a direct keepalive POST that
      // files a deduped crash task regardless of mount state.
      const summary = `boot-snapshot: unresolved descriptor key(s): ${missing.join(", ")}`;
      console.error(`[boot-snapshot] no descriptor registered for: ${missing.join(", ")}`);
      void report({
        kind: "crash",
        source: "boot-snapshot",
        message: summary,
        url: window.location.href,
        userAgent: navigator.userAgent,
        // Matches the crash kind's CrashPayloadSchema (errorType + stack). No real
        // Error is thrown here, so we synthesize a minimal stack for fingerprinting.
        data: {
          errorType: "BootSnapshotUnresolvedDescriptor",
          stack: new Error(summary).stack ?? null,
        },
      });
    }
  },
});

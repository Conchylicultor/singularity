import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { deploymentResource } from "@plugins/build/plugins/deployment/core";

// Robust stale-tab detection: compare the graph hash baked into the executing
// bundle against the graph the server is currently serving — the `web` carrier's
// pin in the deployment description. Fires even for a tab that *loaded* an
// already-stale `index.html`, because the comparison is between two identities
// of the bytes rather than between two moments in time.
//
// The graph hash is a function of the composed module graph, so a rebuild that
// changed nothing republishes the same value and no tab is asked to reload — the
// per-run build id this replaced was new on every build by construction.
//
// The `baked !== "dev"` guard keeps it inert wherever the global is not injected
// (a dev server), where an absent pin would otherwise read as a permanent
// mismatch.
export function useStaleFrontend(): {
  stale: boolean;
  serverGraph: string | null;
} {
  const res = useResource(deploymentResource);
  // Not a collapse: staleness is unknowable mid-load, so stale=false while
  // pending is genuinely correct — we cannot claim the tab is stale or fresh
  // until the server's graph hash has been received.
  if (res.pending) return { stale: false, serverGraph: null };
  // An unresolved pin (no dist yet, or one published before the trailer existed)
  // means the graph is UNKNOWN, and unknown must not arm the reload dot — a
  // missing pin can never manufacture a permanent stale-tab warning.
  const web = res.data.deployable.find((c) => c.id === "web");
  const serverGraph =
    web !== undefined && web.graph.resolved ? web.graph.value : null;
  const baked = import.meta.env.VITE_BUILD_GRAPH ?? "dev";
  const stale = !!serverGraph && baked !== "dev" && serverGraph !== baked;
  return { stale, serverGraph };
}

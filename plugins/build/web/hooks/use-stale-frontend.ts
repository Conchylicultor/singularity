import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { frontendHashResource } from "../../shared";

// Robust stale-tab detection: compare the executing bundle's baked build id
// against the server's current build id. Fires even for a tab that *loaded* an
// already-stale `index.html`. The `baked !== "dev"` guard keeps it inert under
// the dev server (where VITE_BUILD_ID is "dev").
export function useStaleFrontend(): { stale: boolean; serverBuildId: string | null } {
  const res = useResource(frontendHashResource);
  // Not a collapse: staleness is unknowable mid-load, so stale=false while
  // pending is genuinely correct — we cannot claim the tab is stale or fresh
  // until the server build id has been received.
  if (res.pending) return { stale: false, serverBuildId: null };
  const serverBuildId = res.data.buildId || null;
  const baked = import.meta.env.VITE_BUILD_ID ?? "dev";
  const stale = !!serverBuildId && baked !== "dev" && serverBuildId !== baked;
  return { stale, serverBuildId };
}

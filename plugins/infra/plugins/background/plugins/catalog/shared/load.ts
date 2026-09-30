import {
  RECENT_RUNS_MAX,
  type BackgroundEntry,
  type BackgroundRecentRuns,
} from "../core";
import { mergeCatalog } from "./merge";
import { providerOf, registeredProviders } from "./providers";

/**
 * Every registered provider's entries, merged. One implementation for both
 * runtimes: the worktree backend and central each hold their own provider set
 * (process state), and each serves its own half of the catalog.
 *
 * `annotate` lets the serving runtime enrich an entry from knowledge no
 * provider owns (the worktree backend's trigger sources: which events start a
 * job). It never adds or removes entries.
 */
export async function loadCatalog(
  annotate: (entry: BackgroundEntry) => BackgroundEntry = (e) => e,
): Promise<BackgroundEntry[]> {
  const listings = await Promise.all(
    registeredProviders().map(async (p) => ({
      kind: p.kind,
      entries: await p.list(),
    })),
  );
  return mergeCatalog(listings).map(annotate);
}

/** One entry's recent runs, capped; `tracked: false` for a provider that keeps
 * no history. */
export async function loadRecentRuns({
  kind,
  name,
}: {
  kind: string;
  name: string;
}): Promise<BackgroundRecentRuns> {
  const provider = providerOf(kind);
  if (provider.recentRuns === undefined) return { tracked: false };
  const runs = await provider.recentRuns(name);
  return { tracked: true, runs: runs.slice(0, RECENT_RUNS_MAX) };
}

// A provider's change signal can fire every few seconds (per-minute monitors
// start and finish all the time), and each catalog load reads every provider.
// At most one push per window keeps an open page live without churning.
export const CATALOG_THROTTLE_MS = 3_000;
export const RECENT_RUNS_THROTTLE_MS = 1_000;

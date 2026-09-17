import { defaultSnapshotPath } from "./lookup";
import { ipCountryRefreshJob, snapshotNeedsRefresh } from "./refresh";

/**
 * Enqueue the refresh right after boot when the snapshot is missing or stale,
 * so a fresh install has its data within about a minute instead of waiting for
 * the weekly cron. Runs on every backend: each deployed install is its own
 * main-less world, and a local worktree's run finds the shared file fresh.
 */
export async function enqueueRefreshIfNeeded(): Promise<void> {
  if (await snapshotNeedsRefresh(defaultSnapshotPath(), new Date())) {
    await ipCountryRefreshJob.enqueue({});
  }
}

import type { IndexStatus } from "../../core";
import { songIndexLoadJob } from "./load-job";
import {
  clearFailedIndexState,
  currentIndexTarget,
  isIndexRequested,
  loadIndexStatus,
  readIndexState,
  recordIndexRequest,
} from "./state";
import { isIndexCurrent } from "./status";

/**
 * Start a load unless the index is current. A failed state is cleared first,
 * so the status reads `queued` rather than the old error until the retry runs.
 * An enqueue while a load runs is harmless: its claim loses to the running one.
 */
async function loadUnlessCurrent(): Promise<void> {
  const state = await readIndexState();
  if (isIndexCurrent(state, currentIndexTarget())) return;
  if (state?.phase === "failed") await clearFailedIndexState();
  await songIndexLoadJob.enqueue({});
}

/** `POST /api/chord/index/ensure`: this instance uses the app; load the index if it is not loaded. */
export async function ensureIndex(): Promise<IndexStatus> {
  await recordIndexRequest();
  await loadUnlessCurrent();
  return loadIndexStatus();
}

/**
 * The boot check: reload a stale index (a derivation bump, a restored or forked
 * database whose index tables are empty) — only where someone opened the app.
 * An instance that never did downloads nothing.
 */
export async function ensureIndexAtBoot(): Promise<void> {
  if (!(await isIndexRequested())) return;
  await loadUnlessCurrent();
}

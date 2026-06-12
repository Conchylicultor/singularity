import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { getServerBuildId } from "@plugins/build/server";
import { setMutedByMetadata } from "@plugins/shell/plugins/notifications/server";
import { _crashes } from "./tables";
import { crashesResource } from "./resources";
import { isNoiseCrash } from "./noise-rules";

// Re-evaluate every crash row against the CURRENT noise-rule set and sync both
// the stored `crashes.noise` flag and the linked notification's `muted` flag.
//
// `noise` is snapshotted at record time, so a crash recorded before a rule
// existed keeps a stale `noise: false` forever — surfacing an un-muted, badge-
// counting notification for what is now known to be benign noise. (This is
// exactly how the resize-observer rule, added 2026-06-07, left May-era
// ResizeObserver crashes un-muted.) Reconciling on boot is the self-healing
// fix: idempotent, runs whenever the rule set may have changed (a deploy), and
// touches only rows whose classification actually flips. After the first
// reconcile a steady-state boot does a single SELECT and zero writes.
export async function backfillNoiseClassification(): Promise<void> {
  const serverBuildId = getServerBuildId();
  const rows = await db
    .select({
      id: _crashes.id,
      source: _crashes.source,
      errorType: _crashes.errorType,
      message: _crashes.message,
      stack: _crashes.stack,
      noise: _crashes.noise,
      lastBuildId: _crashes.lastBuildId,
    })
    .from(_crashes);

  const flippedToNoise: string[] = [];
  const flippedToSignal: string[] = [];
  for (const row of rows) {
    // Mirror record-crash's staleOrigin derivation so a row reclassifies
    // identically to how a fresh occurrence would be classified right now.
    const staleOrigin =
      row.lastBuildId != null &&
      serverBuildId != null &&
      row.lastBuildId !== serverBuildId;
    const noise = isNoiseCrash({
      source: row.source,
      errorType: row.errorType,
      message: row.message,
      stack: row.stack,
      staleOrigin,
    });
    if (noise === row.noise) continue;
    await db.update(_crashes).set({ noise }).where(eq(_crashes.id, row.id));
    (noise ? flippedToNoise : flippedToSignal).push(row.id);
  }

  if (flippedToNoise.length === 0 && flippedToSignal.length === 0) return;

  // Notifications link back to their crash via metadata.crashId (set in
  // record-crash). At most two batched updates → at most two resource pushes.
  await setMutedByMetadata("crashId", flippedToNoise, true);
  await setMutedByMetadata("crashId", flippedToSignal, false);
  crashesResource.notify();
}

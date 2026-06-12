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

  const noiseIds: string[] = [];
  const signalIds: string[] = [];
  let rowFlips = 0;
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
    if (noise !== row.noise) {
      await db.update(_crashes).set({ noise }).where(eq(_crashes.id, row.id));
      rowFlips++;
    }
    (noise ? noiseIds : signalIds).push(row.id);
  }

  // Reconcile EVERY linked notification's `muted` to its crash row's current
  // noise — not just rows whose flag flipped this boot. A notification can
  // diverge from an unchanged row: pre-dedup, `muted` was snapshotted per
  // occurrence at record time, so a row that was already `noise: true` can still
  // carry earlier occurrences' un-muted notifications (e.g. occurrences recorded
  // while the firing tab's build matched the server's). Notifications link back
  // via metadata.crashId; setMutedByMetadata writes only the rows that actually
  // disagree and pushes only when something changed, so a converged steady state
  // does two indexed scans and zero writes.
  const muted = await setMutedByMetadata("crashId", noiseIds, true);
  const unmuted = await setMutedByMetadata("crashId", signalIds, false);
  if (rowFlips > 0 || muted > 0 || unmuted > 0) crashesResource.notify();
}

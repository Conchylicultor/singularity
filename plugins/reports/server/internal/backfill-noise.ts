import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { getServerBuildId } from "@plugins/build/server";
import { setMutedByMetadata } from "@plugins/shell/plugins/notifications/server";
import { _reports } from "./tables";
import { isNoiseReport } from "./noise-rules";

// Re-evaluate every report row against the CURRENT noise-rule set and sync both
// the stored `reports.noise` flag and the linked notification's `muted` flag.
//
// `noise` is snapshotted at record time, so a report recorded before a rule
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
      id: _reports.id,
      source: _reports.source,
      message: _reports.message,
      data: _reports.data,
      noise: _reports.noise,
      lastBuildId: _reports.lastBuildId,
    })
    .from(_reports);

  const noiseIds: string[] = [];
  const signalIds: string[] = [];
  for (const row of rows) {
    // Mirror record-report's staleOrigin derivation so a row reclassifies
    // identically to how a fresh occurrence would be classified right now.
    const staleOrigin =
      row.lastBuildId != null &&
      serverBuildId != null &&
      row.lastBuildId !== serverBuildId;
    // Crash-shaped noise fields live in the kind's generic `data` payload.
    const errorType =
      typeof row.data.errorType === "string" ? row.data.errorType : null;
    const stack = typeof row.data.stack === "string" ? row.data.stack : null;
    const noise = isNoiseReport({
      source: row.source,
      errorType,
      message: row.message,
      stack,
      staleOrigin,
    });
    if (noise !== row.noise) {
      await db.update(_reports).set({ noise }).where(eq(_reports.id, row.id));
    }
    (noise ? noiseIds : signalIds).push(row.id);
  }

  // Reconcile EVERY linked notification's `muted` to its report row's current
  // noise — not just rows whose flag flipped this boot. A notification can
  // diverge from an unchanged row: pre-dedup, `muted` was snapshotted per
  // occurrence at record time, so a row that was already `noise: true` can still
  // carry earlier occurrences' un-muted notifications (e.g. occurrences recorded
  // while the firing tab's build matched the server's). Notifications link back
  // via metadata.reportId; setMutedByMetadata writes only the rows that actually
  // disagree and pushes only when something changed, so a converged steady state
  // does two indexed scans and zero writes.
  await setMutedByMetadata("reportId", noiseIds, true);
  await setMutedByMetadata("reportId", signalIds, false);
}

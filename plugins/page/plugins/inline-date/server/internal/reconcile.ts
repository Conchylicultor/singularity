import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { liveBlocks } from "@plugins/page/plugins/editor/server";
import { plainOf } from "@plugins/page/plugins/editor/core";
import { scanReminderTokens } from "../../core";
import { reminderFireJob } from "./fire-job";
import { _pageReminders } from "./tables";

const TextShape = z.object({ text: z.unknown() });

function blockText(data: unknown): string {
  const r = TextShape.safeParse(data);
  return r.success ? plainOf(r.data.text) : "";
}

/**
 * Reconcile a page's reminders against its current block text. Diff-based and
 * idempotent (mirrors `reindexPage`): bound to `page.blocksChanged`, so it runs
 * on every edit and only acts on genuine changes.
 *
 *  - token present, no row        → insert `pending` row + schedule fire job
 *  - token present, row `pending`,
 *    changed                       → update fireAt/blockId + re-schedule (job_key
 *                                    dedup replaces the pending job)
 *  - token present, row `canceled` → REVIVE: back to `pending` + re-schedule.
 *    A block delete is a trash, so its reminder row is not cascaded away — it
 *    is canceled here when the token vanishes from the live text — and an undo
 *    of that delete brings the token back with the SAME id. Without this arm
 *    the restored reminder would stay silently canceled forever.
 *  - token gone, row `pending`     → mark `canceled` (the queued job will no-op)
 *  - already `fired`               → left untouched
 *
 * One transaction: the row writes and the job enqueue commit together (a
 * rollback drops both), and the reads see one snapshot. `executor` is the
 * global handle in production, or a db-test-fixture DB (which then needs the
 * queue schema installed — `installQueueSchema` — for the enqueue to land).
 */
export async function reconcileReminders(
  pageId: string,
  executor: NodePgDatabase = db,
): Promise<void> {
  await executor.transaction(async (tx) => {
    const blocks = await tx
      .select({ id: liveBlocks.id, data: liveBlocks.data })
      .from(liveBlocks)
      .where(eq(liveBlocks.pageId, pageId));

    const current = new Map<string, { iso: string; blockId: string }>();
    for (const b of blocks) {
      for (const { id, iso } of scanReminderTokens(blockText(b.data))) {
        current.set(id, { iso, blockId: b.id });
      }
    }

    const rows = await tx
      .select()
      .from(_pageReminders)
      .where(eq(_pageReminders.pageId, pageId));
    const existing = new Map(rows.map((r) => [r.id, r]));

    for (const [id, { iso, blockId }] of current) {
      const row = existing.get(id);
      const fireAt = new Date(iso);
      if (!row) {
        await tx
          .insert(_pageReminders)
          .values({ id, pageId, blockId, fireAt, status: "pending" });
        await reminderFireJob.enqueue(
          { reminderId: id },
          { runAt: fireAt, tx },
        );
      } else if (row.status === "canceled") {
        await tx
          .update(_pageReminders)
          .set({ status: "pending", fireAt, blockId })
          .where(eq(_pageReminders.id, id));
        await reminderFireJob.enqueue(
          { reminderId: id },
          { runAt: fireAt, tx },
        );
      } else if (
        row.status === "pending" &&
        (row.fireAt.getTime() !== fireAt.getTime() || row.blockId !== blockId)
      ) {
        await tx
          .update(_pageReminders)
          .set({ fireAt, blockId })
          .where(eq(_pageReminders.id, id));
        await reminderFireJob.enqueue(
          { reminderId: id },
          { runAt: fireAt, tx },
        );
      }
    }

    const orphaned = rows
      .filter((r) => r.status === "pending" && !current.has(r.id))
      .map((r) => r.id);
    if (orphaned.length > 0) {
      await tx
        .update(_pageReminders)
        .set({ status: "canceled" })
        .where(
          and(
            eq(_pageReminders.pageId, pageId),
            inArray(_pageReminders.id, orphaned),
          ),
        );
    }
  });
}

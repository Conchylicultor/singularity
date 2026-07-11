import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { _blocks } from "@plugins/page/plugins/editor/server";
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
 *  - token present, no row      → insert `pending` row + schedule fire job
 *  - token present, row changed → update fireAt/blockId + re-schedule (job_key
 *    dedup replaces the pending job)
 *  - token gone, row `pending`  → mark `canceled` (the queued job will no-op)
 *  - already `fired`            → left untouched
 */
export async function reconcileReminders(pageId: string): Promise<void> {
  const blocks = await db
    .select({ id: _blocks.id, data: _blocks.data })
    .from(_blocks)
    .where(and(eq(_blocks.pageId, pageId), isNull(_blocks.deletedAt)));

  const current = new Map<string, { iso: string; blockId: string }>();
  for (const b of blocks) {
    for (const { id, iso } of scanReminderTokens(blockText(b.data))) {
      current.set(id, { iso, blockId: b.id });
    }
  }

  const rows = await db
    .select()
    .from(_pageReminders)
    .where(eq(_pageReminders.pageId, pageId));
  const existing = new Map(rows.map((r) => [r.id, r]));

  for (const [id, { iso, blockId }] of current) {
    const row = existing.get(id);
    const fireAt = new Date(iso);
    if (!row) {
      await db
        .insert(_pageReminders)
        .values({ id, pageId, blockId, fireAt, status: "pending" });
      await reminderFireJob.enqueue({ reminderId: id }, { runAt: fireAt });
    } else if (
      row.status === "pending" &&
      (row.fireAt.getTime() !== fireAt.getTime() || row.blockId !== blockId)
    ) {
      await db
        .update(_pageReminders)
        .set({ fireAt, blockId })
        .where(eq(_pageReminders.id, id));
      await reminderFireJob.enqueue({ reminderId: id }, { runAt: fireAt });
    }
  }

  const orphaned = rows
    .filter((r) => r.status === "pending" && !current.has(r.id))
    .map((r) => r.id);
  if (orphaned.length > 0) {
    await db
      .update(_pageReminders)
      .set({ status: "canceled" })
      .where(
        and(eq(_pageReminders.pageId, pageId), inArray(_pageReminders.id, orphaned)),
      );
  }
}

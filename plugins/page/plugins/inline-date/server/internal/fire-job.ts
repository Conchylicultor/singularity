import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { recordNotification } from "@plugins/shell/plugins/notifications/server";
import { pageDetailRoute } from "@plugins/apps/plugins/pages/plugins/page-tree/core";
import { pagesApp } from "@plugins/apps/plugins/pages/plugins/shell/core";
import { _blocks } from "@plugins/page/plugins/editor/server";
import { plainOf } from "@plugins/page/plugins/editor/core";
import { stripInlineTokens } from "../../core";
import { _pageReminders } from "./tables";

const TextShape = z.object({ text: z.unknown() });
const PageShape = z.object({ title: z.string() });

/**
 * Fires one reminder: scheduled by the reconciler via `enqueue({ runAt })`. Keyed
 * on `reminderId` (graphile job_key) so re-scheduling replaces the pending job
 * rather than stacking. Re-reads the row at fire time and no-ops unless it is
 * still `pending` — that is how cancellation works without removing the queued
 * job: a deleted/canceled reminder simply finds no pending row. The notification
 * write goes through `ctx.step` so a retry never double-sends.
 */
export const reminderFireJob = defineJob({
  name: "page.reminders.fire",
  input: z.object({ reminderId: z.string() }),
  event: z.never(),
  dedup: { key: (i) => i.reminderId },
  run: async ({ input, ctx }) => {
    const [row] = await db
      .select()
      .from(_pageReminders)
      .where(eq(_pageReminders.id, input.reminderId));
    if (!row || row.status !== "pending") return;

    await ctx.step("notify", async () => {
      const [block] = await db
        .select({ data: _blocks.data })
        .from(_blocks)
        .where(and(eq(_blocks.id, row.blockId), isNull(_blocks.deletedAt)));
      const [page] = await db
        .select({ data: _blocks.data })
        .from(_blocks)
        .where(and(eq(_blocks.id, row.pageId), isNull(_blocks.deletedAt)));

      const pageParsed = PageShape.safeParse(page?.data);
      const pageTitle = (pageParsed.success && pageParsed.data.title) || "Untitled";
      const blockParsed = block ? TextShape.safeParse(block.data) : undefined;
      const snippet = blockParsed?.success ? stripInlineTokens(plainOf(blockParsed.data.text)) : "";

      await recordNotification({
        type: "page.reminder",
        title: `Reminder · ${pageTitle}`,
        description: snippet || pageTitle,
        variant: "info",
        linkTo: pageDetailRoute.link(pagesApp, { pageId: row.pageId }),
        dedupeKey: `page.reminder:${row.id}`,
      });
    });

    await db
      .update(_pageReminders)
      .set({ status: "fired" })
      .where(eq(_pageReminders.id, row.id));
  },
});

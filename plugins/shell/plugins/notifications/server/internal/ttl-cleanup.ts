import { and, eq, lt, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { _notifications } from "./tables";

const DISMISSED_TTL_MS = 7 * 24 * 3_600_000;
const AUTO_DISMISS_TTL_MS = 24 * 3_600_000;

export const ttlCleanupJob = defineJob({
  name: "notifications.ttl-cleanup",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "0 * * * *" }, // hourly
  async run() {
    const dismissedCutoff = new Date(Date.now() - DISMISSED_TTL_MS);
    await db
      .delete(_notifications)
      .where(and(eq(_notifications.dismissed, true), lt(_notifications.createdAt, dismissedCutoff)));

    const autoDismissCutoff = new Date(Date.now() - AUTO_DISMISS_TTL_MS);
    await db
      .update(_notifications)
      .set({ dismissed: true })
      .where(
        and(
          eq(_notifications.dismissed, false),
          inArray(_notifications.variant, ["info", "success"]),
          lt(_notifications.createdAt, autoDismissCutoff),
        ),
      );
  },
});

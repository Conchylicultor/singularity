import { and, lt, not, or, sql } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { _attachments } from "./tables";
import { getRegisteredLinks } from "./define-link";

const TTL_MS = 60 * 60 * 1000; // 1 hour orphan age before delete
const log = Log.channel("attachments");

// Reclaims attachment rows that no registered link table references, past a
// TTL grace period. Runs hourly via the jobs cron primitive. The schedule is
// main-only by default (not `perWorktree`), so a single sweep runs on the main
// runtime — attachments live on the shared ~/.singularity filesystem, so
// running this per-worktree would race N sweeps over the same global dir.
export const orphanSweepJob = defineJob({
  name: "attachments.orphan-sweep",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "5 * * * *" }, // hourly, offset 5 min
  async run() {
    const cutoff = new Date(Date.now() - TTL_MS);
    const links = getRegisteredLinks();
    // An attachment is "referenced" if any registered link table has a row
    // pointing at its id. Build NOT (EXISTS … OR EXISTS …) across all
    // registered sources. Single statement → Postgres snapshot keeps us from
    // racing a just-inserted link.
    const unreferenced =
      links.length === 0
        ? sql`true`
        : not(
            or(
              ...links.map(
                (l) =>
                  sql`exists (select 1 from ${l.table} where ${l.attachmentIdCol} = ${_attachments.id})`,
              ),
            )!,
          );
    const rows = await db
      .delete(_attachments)
      .where(and(lt(_attachments.createdAt, cutoff), unreferenced))
      .returning({ diskPath: _attachments.diskPath });
    await Promise.all(rows.map((r) => unlink(r.diskPath).catch(() => undefined)));
    if (rows.length > 0) {
      log.publish(`orphan sweep removed ${rows.length} files`);
    }
  },
});

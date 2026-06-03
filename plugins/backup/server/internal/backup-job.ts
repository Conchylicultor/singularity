import { z } from "zod";
import { eq } from "drizzle-orm";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { db } from "@plugins/database/server";
import { getConfig } from "@plugins/config_v2/server";
import { backupConfig } from "../../shared/config";
import { assembleArchive } from "./assemble-archive";
import { BackupTarget } from "./contribution";
import { _backupRuns } from "./tables";

export const backupRunJob = defineJob({
  name: "backup.run",
  input: z.object({
    // Defaulted so cron ticks (which carry no caller input) run as "periodic".
    trigger: z.enum(["manual", "periodic"]).default("periodic"),
  }),
  event: z.never(),
  dedup: "singleton",
  maxAttempts: 2,
  schedule: {
    // Recur on the user-configured cron; empty disables. Read once at worker
    // startup (a change takes effect on the next restart).
    cron: () => getConfig(backupConfig).periodicCron.trim() || null,
  },
  run: async ({ input }) => {
    const runId = crypto.randomUUID();
    await db
      .insert(_backupRuns)
      .values({ id: runId, trigger: input.trigger });

    let archive;
    try {
      archive = await assembleArchive(input.trigger);
    } catch (err) {
      await db
        .update(_backupRuns)
        .set({
          status: "failed",
          finishedAt: new Date(),
          targetResults: [
            {
              targetId: "assembler",
              ok: false,
              detail: err instanceof Error ? err.message : String(err),
            },
          ],
        })
        .where(eq(_backupRuns.id, runId));
      throw err;
    }

    const targets = BackupTarget.getContributions();
    const results = await Promise.all(
      targets.map((t) =>
        t.run(archive).catch((err) => ({
          targetId: t.id,
          ok: false as const,
          detail: err instanceof Error ? err.message : String(err),
        })),
      ),
    );

    const allOk = results.every((r) => r.ok);
    const anyOk = results.some((r) => r.ok);
    const status = allOk ? "ok" : anyOk ? "partial" : "failed";

    await db
      .update(_backupRuns)
      .set({
        status,
        finishedAt: new Date(),
        archiveSizeBytes: archive.manifest.sizeBytes,
        manifest: archive.manifest,
        targetResults: results,
      })
      .where(eq(_backupRuns.id, runId));
  },
});

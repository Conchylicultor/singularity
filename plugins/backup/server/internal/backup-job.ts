import { z } from "zod";
import { eq } from "drizzle-orm";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { db } from "@plugins/database/server";
import { readConfig } from "@plugins/config/server";
import { backupConfig } from "../../shared/config";
import { assembleArchive } from "./assemble-archive";
import { BackupTarget } from "./contribution";
import { _backupRuns } from "./tables";

export const backupRunJob = defineJob({
  name: "backup.run",
  input: z.object({
    trigger: z.enum(["manual", "periodic"]),
  }),
  event: z.never(),
  dedup: "singleton",
  maxAttempts: 2,
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

    if (input.trigger === "periodic") {
      const { periodicIntervalHours } = await readConfig(backupConfig);
      if (periodicIntervalHours > 0) {
        const runAt = new Date(
          Date.now() + periodicIntervalHours * 3_600_000,
        );
        await backupRunJob.enqueue(
          { trigger: "periodic" },
          { runAt },
        );
      }
    }
  },
});

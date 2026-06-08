import { z } from "zod";
import { defineEndpoint, dateString } from "@plugins/infra/plugins/endpoints/core";

export const runBackup = defineEndpoint({
  route: "POST /api/backup/run",
});

const BackupManifestSchema = z.object({
  version: z.literal(1),
  createdAt: z.string(),
  trigger: z.enum(["manual", "periodic"]),
  sources: z.object({
    databases: z.array(z.string()),
    secretsIncluded: z.boolean(),
    attachmentsIncluded: z.boolean(),
  }),
  sizeBytes: z.number(),
});

const BackupTargetResultSchema = z.object({
  targetId: z.string(),
  ok: z.boolean(),
  detail: z.string().optional(),
  needsConsent: z.boolean().optional(),
});

export const BackupRunSchema = z.object({
  id: z.string(),
  trigger: z.string(),
  startedAt: dateString(),
  finishedAt: dateString().nullable(),
  status: z.string(),
  archiveSizeBytes: z.number().nullable(),
  manifest: BackupManifestSchema.nullable(),
  targetResults: z.array(BackupTargetResultSchema).nullable(),
});
export type BackupRun = z.infer<typeof BackupRunSchema>;

export const listBackupRuns = defineEndpoint({
  route: "GET /api/backup/runs",
  response: z.array(BackupRunSchema),
});

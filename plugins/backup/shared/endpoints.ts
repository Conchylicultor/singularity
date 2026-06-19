import { z } from "zod";
import { defineEndpoint, dateString } from "@plugins/infra/plugins/endpoints/core";

export const RunBackupResultSchema = z.object({
  ok: z.literal(true),
  jobId: z.string(),
});
export type RunBackupResult = z.infer<typeof RunBackupResultSchema>;

export const runBackup = defineEndpoint({
  route: "POST /api/backup/run",
  response: RunBackupResultSchema,
});

const BackupSourceReportSchema = z.object({
  id: z.string(),
  name: z.string(),
  skipped: z.boolean(),
  items: z.array(
    z.object({
      label: z.string(),
      detail: z.string().optional(),
      count: z.number().optional(),
    }),
  ),
  sizeBytes: z.number(),
});

const BackupManifestSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  createdAt: z.string(),
  trigger: z.enum(["manual", "periodic"]),
  // v2: array of source reports. v1 legacy rows stored a fixed object —
  // accept it permissively so one old row can't reject the whole list.
  sources: z.union([
    z.array(BackupSourceReportSchema),
    z.object({}).passthrough(),
  ]),
  sizeBytes: z.number(),
});

const BackupTargetResultSchema = z.object({
  targetId: z.string(),
  ok: z.boolean(),
  detail: z.string().optional(),
  needsConsent: z.boolean().optional(),
  consent: z
    .object({ providerId: z.string(), scopes: z.array(z.string()) })
    .optional(),
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

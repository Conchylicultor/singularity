import { z } from "zod";
import { queryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";

export const BuildRunSchema = z.object({
  id: z.string(),
  trigger: z.enum(["manual", "auto"]),
  commitHash: z.string().nullable(),
  // "main" for a normal deploy, or a composition id (sonata, website, …) for a
  // compose-serve child; `parentId` points a child back at its main run.
  target: z.string(),
  parentId: z.string().nullable(),
  startedAt: z.coerce.date(),
  finishedAt: z.coerce.date().nullable(),
  exitCode: z.number().int().nullable(),
});

export type BuildRun = z.infer<typeof BuildRunSchema>;

// Keyed query-resource contract: rows key on `id`. The server half
// (`server/internal/build-history-resource.ts`) is K/full — a windowed
// `orderBy startedAt desc LIMIT 50` read, where a row entering/leaving the top-50
// is a membership change a scoped refill cannot express. It still gains Layer-1
// keyed row diffing. The wire shape stays `BuildRun[]`.
export const buildHistoryResource = queryResourceDescriptor<BuildRun>(
  "build.history",
  BuildRunSchema,
  "id",
  { bootCritical: true },
);

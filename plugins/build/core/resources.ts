import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { queryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import { CommitRowSchema } from "@plugins/primitives/plugins/commit-list/core";

export const MainAheadCountSchema = z.object({
  count: z.number().int(),
  commits: z.array(CommitRowSchema),
});

export type MainAheadCount = z.infer<typeof MainAheadCountSchema>;

export const mainAheadCountResource = resourceDescriptor<MainAheadCount>(
  "build.mainAheadCount",
  MainAheadCountSchema,
  { count: 0, commits: [] },
  { bootCritical: true },
);

export const FrontendHashSchema = z.object({ hash: z.string(), buildId: z.string() });
export type FrontendHash = z.infer<typeof FrontendHashSchema>;
export const frontendHashResource = resourceDescriptor<FrontendHash>(
  "build.frontendHash",
  FrontendHashSchema,
  { hash: "", buildId: "" },
  { bootCritical: true },
);

export const BuildRunSchema = z.object({
  id: z.string(),
  trigger: z.enum(["manual", "auto"]),
  commitHash: z.string().nullable(),
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

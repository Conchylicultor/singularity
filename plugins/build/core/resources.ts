import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

export const MainAheadCountSchema = z.object({
  count: z.number().int(),
});

export type MainAheadCount = z.infer<typeof MainAheadCountSchema>;

export const mainAheadCountResource = resourceDescriptor<MainAheadCount>(
  "build.mainAheadCount",
  MainAheadCountSchema,
  { count: 0 },
);

export const FrontendHashSchema = z.object({ hash: z.string() });
export type FrontendHash = z.infer<typeof FrontendHashSchema>;
export const frontendHashResource = resourceDescriptor<FrontendHash>(
  "build.frontendHash",
  FrontendHashSchema,
  { hash: "" },
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

export const buildHistoryResource = resourceDescriptor<BuildRun[]>(
  "build.history",
  z.array(BuildRunSchema),
  [],
);

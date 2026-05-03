import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";

export const MainAheadCountSchema = z.object({
  count: z.number().int(),
});

export type MainAheadCount = z.infer<typeof MainAheadCountSchema>;

export const mainAheadCountResource = resourceDescriptor<MainAheadCount>(
  "build.mainAheadCount",
  MainAheadCountSchema,
);

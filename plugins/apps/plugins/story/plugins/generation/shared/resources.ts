import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import type { GenStatus } from "../core";

// Client-facing row shape. Omits prompt + timestamps (server-only debug fields);
// includes `instruction` so the UI can prefill the iteration field.
export const StoryGeneratedUnitRowSchema = z.object({
  id: z.string(),
  pageId: z.string(),
  kind: z.string(),
  unitId: z.string(),
  inputHash: z.string(),
  status: z.enum(["generating", "ready", "error"]),
  output: z.string().nullable(),
  instruction: z.string().nullable(),
  error: z.string().nullable(),
});
export type StoryGeneratedUnitRow = z.infer<typeof StoryGeneratedUnitRowSchema>;

// Guarantee the row's status union stays in sync with the canonical GenStatus.
type _StatusInSync = StoryGeneratedUnitRow["status"] extends GenStatus
  ? GenStatus extends StoryGeneratedUnitRow["status"]
    ? true
    : never
  : never;
const _statusInSync: _StatusInSync = true;
void _statusInSync;

export const storyGeneratedUnitsResource = resourceDescriptor<StoryGeneratedUnitRow[]>(
  "story-generated-units",
  z.array(StoryGeneratedUnitRowSchema),
  [],
);

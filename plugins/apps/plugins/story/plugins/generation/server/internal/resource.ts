import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  StoryGeneratedUnitRowSchema,
  type StoryGeneratedUnitRow,
} from "../../shared/resources";
import { _storyGeneratedUnits } from "./tables";

// Loads all rows; the web hook filters by (pageId, kind, unitId) client-side
// (mirrors auto-start). Scope by pageId later if the table grows.
export const storyGeneratedUnitsResource = defineResource({
  key: "story-generated-units",
  mode: "push",
  schema: z.array(StoryGeneratedUnitRowSchema),
  loader: async (): Promise<StoryGeneratedUnitRow[]> => {
    const rows = await db.select().from(_storyGeneratedUnits);
    return rows.map((r) => ({
      id: r.id,
      pageId: r.pageId,
      kind: r.kind,
      unitId: r.unitId,
      inputHash: r.inputHash,
      status: r.status,
      output: r.output,
      instruction: r.instruction,
      error: r.error,
    }));
  },
});

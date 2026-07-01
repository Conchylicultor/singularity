import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { storyGeneratedUnits } from "./tables";

// Loads all rows; the web hook filters by (pageId, kind, unitId) client-side
// (mirrors auto-start). Scope by pageId later if the table grows. Selects only
// the wire columns, so the server-only prompt/timestamps are never fetched.
export const storyGeneratedUnitsResource = defineResource({
  key: "story-generated-units",
  mode: "push",
  schema: z.array(storyGeneratedUnits.schema),
  loader: async () =>
    db.select(storyGeneratedUnits.wireColumns).from(storyGeneratedUnits.table),
});

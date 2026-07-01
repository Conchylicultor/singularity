import { uniqueIndex } from "drizzle-orm/pg-core";
import {
  defineEntity,
  defaultNow,
  defaultRandom,
} from "@plugins/infra/plugins/entities/server";
import {
  storyGeneratedUnitFields,
  STORY_GENERATED_UNIT_SERVER_ONLY,
} from "../../core/schemas";

// One row per (page, kind, unit). `kind` is the rendererId (e.g. "blog");
// `unitId` is a renderer-derived stable id ("article" for blog v1, a node id
// once segmented). Whole-artifact = all rows for (pageId, kind). The table + the
// wire schema both derive from the single `storyGeneratedUnitFields` record
// (core); `prompt` + the timestamps stay in the DDL but are kept off the wire.
export const storyGeneratedUnits = defineEntity(
  "story_generated_units",
  storyGeneratedUnitFields,
  {
    primaryKey: "id",
    serverOnly: STORY_GENERATED_UNIT_SERVER_ONLY,
    columns: {
      id: { default: defaultRandom() },
      createdAt: { default: defaultNow() },
      updatedAt: { default: defaultNow() },
    },
    indexes: (t) => [
      uniqueIndex("story_generated_units_pk_idx").on(t.pageId, t.kind, t.unitId),
    ],
  },
);

// drizzle-kit schema-glob discovery. Name kept so the barrel re-export and the
// mutations/routes referencing the table don't churn.
export const _storyGeneratedUnits = storyGeneratedUnits.table;

import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  RhythmRowSchema,
  rhythmResource,
  type RhythmRow,
} from "../../shared/resources";
import { _songRhythmExt } from "./tables";

/**
 * Copy a stored pattern into the plain wire shape. The jsonb column is typed
 * `RhythmPattern` (`readonly onsets`); the row schema's inferred `onsets` is a
 * mutable `number[]`, so the array is copied to satisfy the type (and to avoid
 * aliasing the drizzle-parsed object).
 */
function plainPattern(p: {
  presetId: string | null;
  subdivisions: number;
  onsets: readonly number[];
  rotation: number;
}): RhythmRow["bass"] {
  return {
    presetId: p.presetId,
    subdivisions: p.subdivisions,
    onsets: [...p.onsets],
    rotation: p.rotation,
  };
}

export const rhythmLiveResource = defineResource<RhythmRow[]>({
  key: rhythmResource.key,
  mode: "push",
  schema: z.array(RhythmRowSchema),
  loader: async (): Promise<RhythmRow[]> =>
    (await db.select().from(_songRhythmExt)).map((r) => ({
      songId: r.parentId,
      enabled: r.enabled,
      bass: plainPattern(r.bass),
      chord: plainPattern(r.chord),
    })),
});

import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  ChordModeRowSchema,
  chordModeResource,
  type ChordModeRow,
} from "../../shared/resources";
import { _songChordModeExt } from "./tables";

/**
 * Push-mode rollup of every song's chord mode. The wire shape is declared as a
 * drizzle column projection at the query (the extension's `parentId` FK IS the
 * domain's `songId`), so the row type comes from the columns themselves rather
 * than from a hand-written object a later column could fall out of.
 */
export const chordModeLiveResource = defineResource<ChordModeRow[]>({
  key: chordModeResource.key,
  mode: "push",
  schema: z.array(ChordModeRowSchema),
  loader: (): Promise<ChordModeRow[]> =>
    db
      .select({
        songId: _songChordModeExt.parentId,
        enabled: _songChordModeExt.enabled,
      })
      .from(_songChordModeExt),
});

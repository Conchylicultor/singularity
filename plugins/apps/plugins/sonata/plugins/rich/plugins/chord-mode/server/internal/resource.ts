import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { chordModeResource, type ChordModeRow } from "../../shared/resources";
import { songChordMode } from "./tables";

/**
 * Push-mode rollup of every song's chord mode. The wire shape is the
 * extension's own (`chordModeShape`, whose key IS the domain's `songId`), so the
 * row type comes from the table's declaration rather than from a projection a
 * later column could fall out of.
 */
export const chordModeLiveResource = defineResource<ChordModeRow[]>({
  key: chordModeResource.key,
  mode: "push",
  schema: z.array(songChordMode.schema),
  loader: () => db.select(songChordMode.wireColumns).from(songChordMode.table),
});

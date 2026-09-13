import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { songMidiResource, type SongMidiRow } from "../../shared/resources";
import { songMidi } from "./tables";

// `wireColumns` leaves the server-only `contentHash` unselected.
export const songMidiLiveResource = defineResource<SongMidiRow[]>({
  key: songMidiResource.key,
  mode: "push",
  schema: z.array(songMidi.schema),
  loader: () => db.select(songMidi.wireColumns).from(songMidi.table),
});

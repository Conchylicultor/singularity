import { serveCollection } from "@plugins/network/plugins/live/server";
import { chordModes } from "../../shared/resources";
import { songChordMode } from "./tables";

// Server half of the per-song chord-mode read: the lookup-only collection
// served from the extension entity (its wire columns — `songId` is the
// `parent_id` PK), so the row shape is the extension's own declaration.
export const chordModesServed = serveCollection(chordModes, {
  from: songChordMode,
});

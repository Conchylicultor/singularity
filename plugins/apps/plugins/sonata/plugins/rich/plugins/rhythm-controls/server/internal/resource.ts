import { serveCollection } from "@plugins/network/plugins/live/server";
import { rhythms } from "../../shared/resources";
import { songRhythm } from "./tables";

// Server half of the per-song groove read: the lookup-only collection served
// from the extension entity (its wire columns — `songId` is the `parent_id` PK;
// both patterns are jsonb decoded by `RhythmPatternSchema`).
export const rhythmsServed = serveCollection(rhythms, { from: songRhythm });

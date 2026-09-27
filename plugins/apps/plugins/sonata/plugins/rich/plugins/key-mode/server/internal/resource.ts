import { serveCollection } from "@plugins/network/plugins/live/server";
import { keyAutoDetects } from "../../shared/resources";
import { songKeyAutoDetect } from "./tables";

// Server half of the per-song key-auto-detect read: the lookup-only collection
// served from the extension entity (its wire columns — `songId` is the
// `parent_id` PK).
export const keyAutoDetectsServed = serveCollection(keyAutoDetects, {
  from: songKeyAutoDetect,
});

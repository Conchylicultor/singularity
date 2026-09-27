import { serveCollection } from "@plugins/network/plugins/live/server";
import { transposes } from "../../shared/resources";
import { songTranspose } from "./tables";

// Server half of the per-song offset read: the lookup-only collection served
// from the extension entity (its wire columns — `songId` is the `parent_id` PK).
export const transposesServed = serveCollection(transposes, {
  from: songTranspose,
});

import { serveCollection } from "@plugins/network/plugins/live/server";
import { serverHealthRows } from "../../shared/resources";
import { serverHealth } from "./tables";

// Server half of `serverHealthRows`, served from the extension handle: the
// projection is its `wireColumns` and the id is its key `serverId`.
// `hostKeyLine` is `serverOnly` in the shape, so it is never even selected:
// pinning is a server-side concern, and the UI keys the "Forget host key" action
// off the `host-key-mismatch` failure kind instead.
export const serverHealthRowsServed = serveCollection(serverHealthRows, {
  from: serverHealth,
});

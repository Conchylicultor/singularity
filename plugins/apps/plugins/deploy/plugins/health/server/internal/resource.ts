import { queryResource } from "@plugins/infra/plugins/query-resource/server";
import { serverHealthResource as serverHealthDescriptor } from "../../shared/resources";
import { serverHealth } from "./tables";

// Compiled keyed query-resource — the default identityTable-scoped keyed
// resource. The extension handle is the source, so the projection is its
// `wireColumns` and the identity is its key `serverId`. `hostKeyLine` is
// `serverOnly` in the shape, so it is never even selected: pinning is a
// server-side concern, and the UI keys the "Forget host key" action off the
// `host-key-mismatch` failure kind instead.
export const serverHealthServerResource = queryResource(
  serverHealthDescriptor,
  {
    from: serverHealth,
  },
);

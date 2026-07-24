import { queryResource } from "@plugins/infra/plugins/query-resource/server";
import { serverHealthResource as serverHealthDescriptor } from "../../shared/resources";
import { _deployServersHealthExt } from "./tables";

// Compiled keyed query-resource — the default identityTable-scoped keyed
// resource. The projection is explicit (rather than a select-all) so
// `hostKeyLine` never reaches a client: pinning is a server-side concern, and
// the UI keys the "Forget host key" action off the `host-key-mismatch` failure
// kind instead.
export const serverHealthServerResource = queryResource(serverHealthDescriptor, {
  from: _deployServersHealthExt,
  select: {
    parentId: _deployServersHealthExt.parentId,
    ok: _deployServersHealthExt.ok,
    checkedAt: _deployServersHealthExt.checkedAt,
    failureKind: _deployServersHealthExt.failureKind,
    failureMessage: _deployServersHealthExt.failureMessage,
    checkedPublicKey: _deployServersHealthExt.checkedPublicKey,
  },
});

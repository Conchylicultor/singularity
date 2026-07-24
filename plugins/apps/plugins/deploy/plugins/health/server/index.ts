import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { serverHealthServerResource } from "./internal/resource";
import { handleCheckSsh } from "./internal/handle-check";
import { handleForgetHostKey } from "./internal/handle-forget-host-key";
import { checkServerSsh, forgetServerHostKey } from "../shared/endpoints";

export { serverHealth } from "./internal/tables";
export { serverHealthServerResource } from "./internal/resource";
export { serverHealthResource, ServerHealthRowSchema } from "../shared";
export type { ServerHealthRow } from "../shared";

export default {
  description:
    "Owns the deploy_servers_ext_health side-table: the last SSH reachability verdict per server (ok, classified failure kind, the public key as of the check, and the TOFU-pinned host key), its keyed live resource, and the probe / forget-host-key endpoints.",
  contributions: [Resource.Declare(serverHealthServerResource)],
  httpRoutes: {
    [checkServerSsh.route]: handleCheckSsh,
    [forgetServerHostKey.route]: handleForgetHostKey,
  },
} satisfies ServerPluginDefinition;

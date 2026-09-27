import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { serverHealthRowsServed } from "./internal/resource";
import { handleCheckSsh } from "./internal/handle-check";
import { handleForgetHostKey } from "./internal/handle-forget-host-key";
import { checkServerSsh, forgetServerHostKey } from "../shared/endpoints";

export { serverHealth } from "./internal/tables";
export { resolveServerSshTarget } from "./internal/ssh-target";
export type {
  DeployServerRow,
  HostKeyPolicy,
  ServerSshTargetResult,
} from "./internal/ssh-target";
export { ServerHealthRowSchema } from "../shared";
export type { ServerHealthRow } from "../shared";

export default {
  description:
    "Owns the deploy_servers_ext_health side-table: the last SSH reachability verdict per server (ok, classified failure kind, the public key as of the check, and the TOFU-pinned host key), its live collection, and the probe / forget-host-key endpoints.",
  contributions: [...serverHealthRowsServed.declare],
  httpRoutes: {
    [checkServerSsh.route]: handleCheckSsh,
    [forgetServerHostKey.route]: handleForgetHostKey,
  },
} satisfies ServerPluginDefinition;

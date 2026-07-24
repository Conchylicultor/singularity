import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Servers } from "@plugins/apps/plugins/deploy/plugins/servers/web";
import { StatusField } from "./components/status-field";
import { ServerStatusHeader } from "./components/status-header";

export { useServerHealthMap, useServerHealth, useServerVerified } from "./hooks";
export { VerifyConnectionBody } from "./components/verify-connection";
export { ServerStatusBadge, serverStatus } from "./components/server-status-badge";
export type { ServerStatus } from "./components/server-status-badge";
export { serverHealthResource, checkServerSsh, forgetServerHostKey } from "../shared";
export type { ServerHealthRow, SshCheckResult } from "../shared";

export default {
  description:
    "Server reachability for the deploy app: probes a registered server over SSH, records the classified verdict, and contributes the derived `status` field into the servers DataView plus the verify step of the SSH setup flow.",
  contributions: [
    Servers.Fields({ id: "status", component: StatusField }),
    Servers.DetailHeader({ id: "status", order: 10, component: ServerStatusHeader }),
  ],
} satisfies PluginDefinition;

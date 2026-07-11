import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { defineHostPool, hostOccupancy } from "./internal/pool";
export type { HostPool, HostPoolSpec, PoolOccupancy } from "./internal/pool";
export { cpuPool, withHostGrant, inheritedGrant } from "./internal/grant";
export { pushPool, PUSH_SLOT_PATH } from "./internal/push";
// The pure `Grant` TYPE lives in `../core` (both runtimes share it); consumers
// import it from there. Only the runtime impl (`withHostGrant`/`inheritedGrant`)
// lives here.

export default {
  description:
    "Host-admission registry: one place a host-wide concurrency pool comes into existence, wrapping createHostSemaphore with a summed CPU/RAM ceiling and true host occupancy.",
} satisfies ServerPluginDefinition;

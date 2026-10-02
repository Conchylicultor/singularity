import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { onDaemonActivity } from "@plugins/infra/plugins/spawn/plugins/daemon/server";
import { daemonsBackgroundKind } from "./internal/provider";

export default {
  description:
    "Long-lived processes in the Background activity catalog: registers the `daemon` background kind — every declaration made with defineDaemon under Long-lived processes, triggered at boot or on demand, its scope from `where`, and its facts (each instance's state, pid, since when, restarts, memory and CPU from one `ps`, the last exit, the restart policy, how liveness is known) — plus each incarnation as a run in this process. Pushes the catalog on every instance transition (start, ready, death, respawn, give-up, stop).",
  register: [daemonsBackgroundKind],
  onReady: () => {
    // For the life of the process: transitions are rare (a respawn is at least
    // a second apart), and the catalog value throttles the pushes.
    onDaemonActivity((name) => daemonsBackgroundKind.changed(name));
  },
} satisfies ServerPluginDefinition;

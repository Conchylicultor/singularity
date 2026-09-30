import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { installDepEndpoint, removeDepEndpoint } from "../core";
import { handleInstallDep, handleRemoveDep } from "./internal/handlers";
import { depsInstallJob } from "./internal/install-job";
import { depsStatesServed } from "./internal/live";
import { depsSweepJob } from "./internal/sweep-job";

// The server half: the install job (and `requestDep`, which enqueues it from
// a request), the sweep, the `deps.states` live value and the endpoints.
// Declaring, ensuring and reading a dependency is the host-only `deps` barrel
// (`@plugins/infra/plugins/deps/deps`).
export { onDepInstallSettled, requestDep } from "./internal/install-job";

export default {
  description:
    "The server half of on-demand dependencies: requestDep enqueues the deps.install supervised job (ensureDep in a detached child) from a request, the pushed deps.states live value says absent / installing / ready / failed for every declared dependency, the install/remove endpoints back Settings → Dependencies, and a daily deps.sweep removes identities no checkout declares that sat unused for 14 days.",
  httpRoutes: {
    [installDepEndpoint.route]: handleInstallDep,
    [removeDepEndpoint.route]: handleRemoveDep,
  },
  register: [depsInstallJob, depsSweepJob],
  contributions: [...depsStatesServed.declare],
} satisfies ServerPluginDefinition;

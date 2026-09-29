import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { installDepEndpoint, removeDepEndpoint } from "../core";
import { handleInstallDep, handleRemoveDep } from "./internal/handlers";
import { depsInstallJob } from "./internal/install-job";
import { depsStatesServed } from "./internal/live";
import { depsSweepJob } from "./internal/sweep-job";

// What a feature uses: declare (`defineDep` + `DepDeclare`), install off the
// event loop (`ensureDep`, needing an ExecContext) or from a request
// (`requestDep`), and read the state (`depState`). Installer kinds implement
// `DepSource`; runners take a `Ready`.
export { defineDep } from "./internal/dep";
export type {
  DefineDepSpec,
  Dep,
  DepSource,
  InstallContext,
  Ready,
} from "./internal/dep";
export { ensureDep, depState, removeDep } from "./internal/ensure";
export type { EnsureOptions, RemoveOutcome } from "./internal/ensure";
export { requestDep } from "./internal/install-job";
export {
  DepDeclare,
  declaredDep,
  declaredDeps,
  UnknownDepError,
} from "./internal/registry";

export default {
  description:
    "Optional dependencies installed on demand: defineDep declares one (an installer kind's source, and how it stays current), ensureDep installs it off the event loop (it demands an ExecContext) under a host flock into a content-addressed cache (`ready.json` written last), requestDep enqueues the deps.install supervised job from a request, depState and the pushed deps.states live value say absent / installing / ready / failed, and a daily deps.sweep removes identities no checkout declares that sat unused for 14 days.",
  httpRoutes: {
    [installDepEndpoint.route]: handleInstallDep,
    [removeDepEndpoint.route]: handleRemoveDep,
  },
  register: [depsInstallJob, depsSweepJob],
  contributions: [...depsStatesServed.declare],
} satisfies ServerPluginDefinition;

import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { defineSupervisedTask } from "./internal/registry";
export type {
  DefineSupervisedTaskSpec,
  RegisteredSupervisedTask,
  SupervisedTask,
} from "./internal/registry";

export default {
  description:
    "An out-of-process body that is not a command line: defineSupervisedTask registers an ordinary async function under an id, and `./singularity supervised-exec <id> <payloadJson>` boots the plugin graph in exec mode and runs it — so work assembled from contributions (backup's sources and targets) can be supervised as a detached child exactly like a CLI verb.",
  // Nothing to register here: a task is mounted by the plugin that DECLARES it,
  // through its own `register: [task]`. The registry this plugin owns is
  // populated by those tokens and read by the `supervised-exec` command.
} satisfies ServerPluginDefinition;

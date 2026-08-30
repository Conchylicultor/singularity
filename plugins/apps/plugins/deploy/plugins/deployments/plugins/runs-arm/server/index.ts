import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { deployRunKind } from "./internal/run-kind";

export default {
  description:
    "The deploy arm of the unified run space: binds deploy_runs into the runs union — status folded into the shared outcome vocabulary through a typed map, a label naming the composition and the server it went to, the verb as both the shared trigger and its own enum dimension, and the CLI's refusal text as the shared message. Reads null for namespace: a deploy targets a remote server, not a worktree.",
  register: [deployRunKind],
} satisfies ServerPluginDefinition;

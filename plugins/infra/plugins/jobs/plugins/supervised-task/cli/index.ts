import { defineCliCommand } from "@plugins/framework/plugins/cli/core";
import { SUPERVISED_EXEC_COMMAND } from "../core";

/**
 * The child half of a supervised task: boot the plugin graph in `exec` mode,
 * run ONE registered task, exit with its status.
 *
 * Not a verb anyone types. It exists because `supervised-run` supervises an
 * ARGV, and a body assembled from plugin contributions has no argv of its own —
 * so this is the argv that stands for one. `SupervisedTask.invoke(payload)`
 * builds the invocation; nothing else should write this command line by hand,
 * which is why the payload is positional JSON rather than a set of flags: there
 * is no ergonomics to serve, only a round-trip to keep exact.
 *
 * `detachable`, and it is not optional. A supervised child is spawned detached
 * and is MEANT to outlive the backend that started it — that is the whole point
 * of the primitive. The orphan guard is armed for every invocation and exits a
 * command whose invoking shell went away, which for this command would kill the
 * very run the design exists to preserve.
 *
 * This file loads on EVERY `./singularity` invocation (commander needs names and
 * flags before it parses argv), so it imports the verb's own name and
 * `defineCliCommand` and nothing else; `runExec` and the task registry sit
 * behind the deferred `run: () => import(…)`. `cli:command-declarations-light`
 * measures that closure.
 */
export default defineCliCommand<[string, string], object>({
  name: SUPERVISED_EXEC_COMMAND,
  description:
    "Run one registered supervised task in a booted `exec` runtime, then exit " +
    "with its status. Spawned by defineSupervisedJob's `task` arm — not a verb " +
    "to type by hand.",
  arguments: [
    {
      name: "<taskId>",
      description: "Id of a task declared with defineSupervisedTask",
    },
    {
      name: "<payloadJson>",
      description:
        "The task's payload as one JSON argument, parsed against its own schema",
    },
  ],
  detachable: true,
  run: () => import("./run"),
});

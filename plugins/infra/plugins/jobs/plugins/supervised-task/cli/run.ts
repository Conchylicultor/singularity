import type { CliAction } from "@plugins/framework/plugins/cli/core";
import { runExec } from "@plugins/framework/plugins/server-core/cli";
import {
  getSupervisedTask,
  getSupervisedTaskIds,
} from "../server/internal/registry";

/**
 * `./singularity supervised-exec <taskId> <payloadJson>`.
 *
 * The whole body sits inside `runExec`, which boots the plugin graph and never
 * returns: it exits 0 when the body resolves and 1 when anything in it throws,
 * running the shutdown hooks either way. The exit status is what the
 * supervising shim records into this run's marker, so a throw here IS how a
 * failed task reaches the ledger.
 *
 * **The lookup happens after boot, and it must.** The registry is populated by
 * each declaring plugin's `register:` token, which the boot's register phase
 * runs — so before boot every id is unknown and after it the set is complete.
 * There is no earlier point at which "unknown task" could be answered honestly.
 */
const run: CliAction<[string, string], object> = async (
  taskId,
  payloadJson,
) => {
  await runExec(async () => {
    const task = getSupervisedTask(taskId);
    if (task === undefined) {
      // Loud, immediately, and naming the id. The alternative — returning
      // quietly — would exit 0, which the shim writes as a `0 -` marker and the
      // ledger records as a successful run that did nothing at all: a backup
      // that reports success and archived nothing.
      const known = getSupervisedTaskIds();
      throw new Error(
        `[supervised-exec] no task registered under ${JSON.stringify(taskId)}. ` +
          (known.length === 0
            ? "No tasks are registered in this composition at all — is the declaring plugin part of it?"
            : `Registered tasks: ${known.join(", ")}.`),
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(payloadJson);
    } catch (err) {
      throw new Error(
        `[supervised-exec] ${taskId}: payload is not valid JSON — ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Parse and run in one call: the task owns its schema, so there is no way
    // from here to run a payload it did not accept.
    await task.execute(raw);
  });
};

export default run;

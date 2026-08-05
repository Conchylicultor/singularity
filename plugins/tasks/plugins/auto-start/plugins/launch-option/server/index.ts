import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { TaskLaunchServer } from "@plugins/tasks/plugins/launch-options/server";
import { armTaskAutoStart } from "@plugins/tasks/server";
import { setTaskAutoStart } from "@plugins/tasks/plugins/auto-start/server";
import { autoStartLaunchOption } from "../core";

export default {
  description:
    "Applies a drafted auto-start model to a newly created task: arms the launch (enqueuing immediately when nothing blocks it), or clears the marker when the draft says Off.",
  contributions: [
    TaskLaunchServer({
      def: autoStartLaunchOption,
      apply: async ({ taskId, cause }, model) => {
        // Arming (not a bare `setTaskAutoStart`) is what actually enqueues the
        // launch when no dependency blocks the task.
        if (model) await armTaskAutoStart({ taskId, model, cause });
        else await setTaskAutoStart(taskId, null);
      },
      // NO `inherit`, deliberately — and the omission is the declaration. This
      // apply ARMS a launch, so inheriting it would start an agent for every
      // task an agent files (including `propose_task` drafts, which are meant
      // to wait for the user to accept them). Each filing tool decides
      // auto-start explicitly instead.
    }),
  ],
} satisfies ServerPluginDefinition;

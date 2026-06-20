import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { BootSnapshot } from "@plugins/infra/plugins/boot-snapshot/web";
import { tasksResource, attemptsResource, pushesResource } from "@plugins/tasks/plugins/tasks-core/core";

export {
  patchTask,
  setAutoStart,
  useTask,
} from "./client";
export type { TaskPatch, AutoStartModel } from "./client";

export default {
  description: "Nested tasks with attempts linking to conversations.",
  contributions: [
    BootSnapshot.Hydrate({ descriptor: tasksResource }),
    BootSnapshot.Hydrate({ descriptor: attemptsResource }),
    BootSnapshot.Hydrate({ descriptor: pushesResource }),
  ],
} satisfies PluginDefinition;

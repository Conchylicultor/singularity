import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { launchPromptsServerResource } from "./internal/resources";
import { handleList }   from "./internal/handle-list";
import { handleCreate } from "./internal/handle-create";
import { handleUpdate } from "./internal/handle-update";
import { handleDelete } from "./internal/handle-delete";
import {
  listLaunchPrompts,
  createLaunchPrompt,
  updateLaunchPrompt,
  deleteLaunchPrompt,
} from "../shared/endpoints";

export default {
  id: "launch-prompts",
  name: "Launch Prompts",
  description:
    "Pre-configured prompts that launch a new background conversation in the same worktree.",
  httpRoutes: {
    [listLaunchPrompts.route]:   handleList,
    [createLaunchPrompt.route]:  handleCreate,
    [updateLaunchPrompt.route]:  handleUpdate,
    [deleteLaunchPrompt.route]:  handleDelete,
  },
  contributions: [Resource.Declare(launchPromptsServerResource)],
} satisfies ServerPluginDefinition;

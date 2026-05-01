import type { ServerPluginDefinition } from "@server/types";
import { launchPromptsServerResource } from "./internal/resources";
import { handleList }   from "./internal/handle-list";
import { handleCreate } from "./internal/handle-create";
import { handleUpdate } from "./internal/handle-update";
import { handleDelete } from "./internal/handle-delete";

export default {
  id: "launch-prompts",
  name: "Launch Prompts",
  description:
    "Pre-configured prompts that launch a new background conversation in the same worktree.",
  httpRoutes: {
    "GET /api/launch-prompts":        handleList,
    "POST /api/launch-prompts":       handleCreate,
    "PATCH /api/launch-prompts/:id":  handleUpdate,
    "DELETE /api/launch-prompts/:id": handleDelete,
  },
  resources: [launchPromptsServerResource],
} satisfies ServerPluginDefinition;

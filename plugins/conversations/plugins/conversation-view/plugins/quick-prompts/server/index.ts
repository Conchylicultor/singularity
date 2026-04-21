import type { ServerPluginDefinition } from "../../../../../../../server/src/types";
import { quickPromptsServerResource } from "./internal/resources";
import { handleList }   from "./internal/handle-list";
import { handleCreate } from "./internal/handle-create";
import { handleUpdate } from "./internal/handle-update";
import { handleDelete } from "./internal/handle-delete";

export default {
  id: "quick-prompts",
  name: "Quick Prompts",
  description:
    "Named prompts that appear as chips in the conversation toolbar. Click to send a preset message.",
  httpRoutes: {
    "GET /api/quick-prompts":       handleList,
    "POST /api/quick-prompts":      handleCreate,
    "PATCH /api/quick-prompts/:id": handleUpdate,
    "DELETE /api/quick-prompts/:id": handleDelete,
  },
  resources: [quickPromptsServerResource],
} satisfies ServerPluginDefinition;

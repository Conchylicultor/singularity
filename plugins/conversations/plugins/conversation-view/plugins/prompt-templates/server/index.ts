import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { promptTemplatesServerResource } from "./internal/resources";
import { handleList }   from "./internal/handle-list";
import { handleCreate } from "./internal/handle-create";
import { handleUpdate } from "./internal/handle-update";
import { handleDelete } from "./internal/handle-delete";
import { handleUse }    from "./internal/handle-use";

export default {
  id: "prompt-templates",
  name: "Prompt Templates",
  description:
    "Named template chips that prepend text to the conversation prompt editor for editing before sending.",
  httpRoutes: {
    "GET /api/prompt-templates":            handleList,
    "POST /api/prompt-templates":           handleCreate,
    "PATCH /api/prompt-templates/:id":      handleUpdate,
    "DELETE /api/prompt-templates/:id":     handleDelete,
    "POST /api/prompt-templates/:id/use":   handleUse,
  },
  contributions: [Resource.Declare(promptTemplatesServerResource)],
} satisfies ServerPluginDefinition;

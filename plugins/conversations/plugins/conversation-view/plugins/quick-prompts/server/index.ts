import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { quickPromptsServerResource } from "./internal/resources";
import { handleList }   from "./internal/handle-list";
import { handleCreate } from "./internal/handle-create";
import { handleUpdate } from "./internal/handle-update";
import { handleDelete } from "./internal/handle-delete";
import {
  listQuickPrompts,
  createQuickPrompt,
  updateQuickPrompt,
  deleteQuickPrompt,
} from "../shared/endpoints";

export default {
  id: "quick-prompts",
  name: "Quick Prompts",
  description:
    "Named prompts that appear as chips in the conversation toolbar. Click to send a preset message.",
  httpRoutes: {
    [listQuickPrompts.route]:   handleList,
    [createQuickPrompt.route]:  handleCreate,
    [updateQuickPrompt.route]:  handleUpdate,
    [deleteQuickPrompt.route]:  handleDelete,
  },
  contributions: [Resource.Declare(quickPromptsServerResource)],
} satisfies ServerPluginDefinition;

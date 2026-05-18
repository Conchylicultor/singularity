import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { Config } from "@plugins/config/server";
import { promptTemplatesServerResource } from "./internal/resources";
import { handleList }   from "./internal/handle-list";
import { handleCreate } from "./internal/handle-create";
import { handleUpdate } from "./internal/handle-update";
import { handleDelete } from "./internal/handle-delete";
import { handleUse }    from "./internal/handle-use";
import {
  listPromptTemplates,
  createPromptTemplate,
  updatePromptTemplate,
  deletePromptTemplate,
  usePromptTemplate,
} from "../shared/endpoints";
import { promptTemplatesConfig } from "../shared/config";

export default {
  id: "prompt-templates",
  name: "Prompt Templates",
  description:
    "Named template chips that prepend text to the conversation prompt editor for editing before sending.",
  httpRoutes: {
    [listPromptTemplates.route]:   handleList,
    [createPromptTemplate.route]:  handleCreate,
    [updatePromptTemplate.route]:  handleUpdate,
    [deletePromptTemplate.route]:  handleDelete,
    [usePromptTemplate.route]:     handleUse,
  },
  contributions: [
    Resource.Declare(promptTemplatesServerResource),
    Config.Field(promptTemplatesConfig),
  ],
} satisfies ServerPluginDefinition;

import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleList } from "./internal/handle-list";
import { handleGet } from "./internal/handle-get";
import { handleCreate } from "./internal/handle-create";
import { handleUpdate } from "./internal/handle-update";
import { handleDelete } from "./internal/handle-delete";
import { handleGenerateKeypair } from "./internal/handle-generate-keypair";
import { serversResource } from "./internal/resources";
import {
  listServers,
  createServer,
  getServer,
  updateServer,
  deleteServer,
  generateSshKeypair,
} from "../shared/endpoints";

export { _deployServers } from "./internal/tables";
export { serversResource } from "./internal/resources";

export default {
  description: "Server registry for the deployment platform.",
  httpRoutes: {
    [listServers.route]: handleList,
    [createServer.route]: handleCreate,
    [getServer.route]: handleGet,
    [updateServer.route]: handleUpdate,
    [deleteServer.route]: handleDelete,
    [generateSshKeypair.route]: handleGenerateKeypair,
  },
  contributions: [Resource.Declare(serversResource)],
} satisfies ServerPluginDefinition;

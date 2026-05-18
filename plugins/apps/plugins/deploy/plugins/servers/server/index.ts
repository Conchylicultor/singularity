import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { handleList } from "./internal/handle-list";
import { handleGet } from "./internal/handle-get";
import { handleCreate } from "./internal/handle-create";
import { handleUpdate } from "./internal/handle-update";
import { handleDelete } from "./internal/handle-delete";
import { serversResource } from "./internal/resources";
import {
  listServers,
  createServer,
  getServer,
  updateServer,
  deleteServer,
} from "../shared/endpoints";

export { _deployServers } from "./internal/tables";
export { serversResource } from "./internal/resources";

export default {
  id: "deploy-servers",
  name: "Deploy: Servers",
  description: "Server registry for the deployment platform.",
  httpRoutes: {
    [listServers.route]: handleList,
    [createServer.route]: handleCreate,
    [getServer.route]: handleGet,
    [updateServer.route]: handleUpdate,
    [deleteServer.route]: handleDelete,
  },
  contributions: [Resource.Declare(serversResource)],
} satisfies ServerPluginDefinition;
